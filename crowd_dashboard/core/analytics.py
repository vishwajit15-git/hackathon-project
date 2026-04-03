# =============================================================================
# core/analytics.py — The Brain: All Math, Physics & Grid Logic
# =============================================================================
# This file processes the raw detection list from vision.py and transforms
# it into a rich grid state with vulnerability tags, force vectors, squeeze
# detection, and a directional DFS shockwave.
#
# PROCESSING ORDER (must be respected — each step depends on the previous):
#   Step 1: Population Mapping     → Map persons to grid cells
#   Step 2: Ground Plane Fitting   → Linear regression for expected heights
#   Step 3: Vulnerability Tagging  → Compare actual vs expected height
#   Step 4: Velocity Computation   → Smooth velocity vectors per person
#   Step 5: Grid Force Accumulation→ Sum velocity vectors per grid cell
#   Step 6: Squeeze Detection      → Detect inward-converging force fields
#   Step 7: Grid State Assignment  → Assign STATE_* to each cell
#   Step 8: DFS Shockwave          → Propagate pressure directionally
#   Step 9: Metrics Update         → Refresh summary counts
# =============================================================================

import numpy as np
from scipy.stats import linregress
from collections import deque
from typing import Optional
from core.state import GlobalState, PersonTrack
from config import (
    GRID_ROWS, GRID_COLS,
    CROWDING_THRESHOLD,
    VULNERABILITY_RATIO,
    MIN_ZONE_POPULATION,
    DEPTH_ZONES,
    MIN_MOVEMENT_THRESHOLD,
    SQUEEZE_DOT_THRESHOLD,
    MIN_PEOPLE_FOR_SQUEEZE,
    MAX_SHOCKWAVE_DEPTH,
    STATE_EMPTY, STATE_OCCUPIED, STATE_CROWDED,
    STATE_SQUEEZE, STATE_CRITICAL, STATE_SHOCKWAVE
)


# =============================================================================
# STEP 1 — Population Mapping
# =============================================================================

def map_persons_to_grid(
    detections: list[dict],
    state: GlobalState,
    frame_num: int
):
    """
    For each detected person, update their PersonTrack and compute which
    grid cell (row, col) they belong to.

    The mapping formula is simply:
        col = int(cx / frame_width  * GRID_COLS)
        row = int(cy / frame_height * GRID_ROWS)

    This normalizes pixel coordinates to the 0..1 range and then scales
    to grid indices. We clamp with min/max to handle edge-of-frame cases
    where YOLO bbox centers can be exactly at the boundary.

    Why store grid coords on PersonTrack?
    Because analytics.py needs to go person→cell (for force accumulation)
    AND cell→persons (for vulnerability check). Storing on the person makes
    both directions O(1).
    """
    fw = state.frame_width
    fh = state.frame_height

    for det in detections:
        tid = det["track_id"]
        person = state.get_or_create_person(tid)

        # Update position history (appends to deque, auto-drops oldest)
        person.update_position(det["cx"], det["cy"], det["height"], frame_num)

        # Map continuous pixel coords to discrete grid indices
        col = int(det["cx"] / fw * GRID_COLS)
        row = int(det["cy"] / fh * GRID_ROWS)

        # Clamp to valid grid range (handles bbox centers exactly at edge)
        person.current_grid_col = max(0, min(GRID_COLS - 1, col))
        person.current_grid_row = max(0, min(GRID_ROWS - 1, row))


# =============================================================================
# STEP 2 — Ground Plane Fitting (Linear Regression for Expected Height)
# =============================================================================

def fit_ground_plane(state: GlobalState) -> tuple[float, float]:
    """
    Build a linear model: bbox_height = m * cy + c

    The core insight is that people further away (larger cy = lower on screen
    in a typical overhead camera, but for a front-facing camera, larger cy
    means lower in the scene and therefore smaller bounding boxes due to
    perspective). By regressing height against Y position across all currently
    visible people, we learn the camera's perspective distortion.

    This gives us the "expected" height for any Y position, so we can
    compare an individual's actual height against what everyone else at
    their same depth looks like.

    We divide the frame into DEPTH_ZONES horizontal slabs and compute the
    mean height per zone. We then run linregress on (zone_center_y, mean_height)
    pairs. Using zone means instead of raw per-person data makes the regression
    robust to outliers (a single fallen person won't skew the model).

    Returns:
        (slope m, intercept c) of the linear model.
        Stored on state.ground_plane_slope / state.ground_plane_intercept
        for use by both analytics and drawing modules.
    """
    if len(state.persons) < MIN_ZONE_POPULATION:
        # Not enough people to fit a meaningful model yet.
        # Return the cached values from the last frame (or defaults).
        return state.ground_plane_slope, state.ground_plane_intercept

    # Collect (cy, height) pairs from all currently tracked persons
    cy_vals = np.array([p.current_cy     for p in state.persons.values()])
    h_vals  = np.array([p.current_height for p in state.persons.values()])

    # Divide Y range into DEPTH_ZONES equal slabs
    y_min, y_max = cy_vals.min(), cy_vals.max()
    if y_max - y_min < 10:
        # All people at nearly the same Y — can't fit a meaningful line
        return state.ground_plane_slope, state.ground_plane_intercept

    zone_edges = np.linspace(y_min, y_max, DEPTH_ZONES + 1)
    zone_centers = []
    zone_mean_heights = []

    for i in range(DEPTH_ZONES):
        lo, hi = zone_edges[i], zone_edges[i + 1]
        # Find people in this depth zone
        mask = (cy_vals >= lo) & (cy_vals < hi)
        if mask.sum() < MIN_ZONE_POPULATION:
            continue  # Skip zones that are sparsely populated
        zone_centers.append((lo + hi) / 2.0)
        zone_mean_heights.append(h_vals[mask].mean())

    if len(zone_centers) < 2:
        # Need at least 2 points for linregress
        return state.ground_plane_slope, state.ground_plane_intercept

    # Fit y = mx + c using scipy's linear regression
    slope, intercept, r_value, p_value, std_err = linregress(
        zone_centers, zone_mean_heights
    )

    # Sanity check: if R² is very low, the scene doesn't follow perspective
    # well (e.g., completely flat crowd). Fall back to cached values.
    if r_value**2 < 0.2:
        return state.ground_plane_slope, state.ground_plane_intercept

    # Update and persist the model on state
    state.ground_plane_slope    = float(slope)
    state.ground_plane_intercept = float(intercept)

    return state.ground_plane_slope, state.ground_plane_intercept


def expected_height(cy: float, slope: float, intercept: float) -> float:
    """
    Given a Y position, return the expected bounding box height based on
    the fitted ground plane model.

    Clamps to a minimum of 20px to avoid division-by-zero edge cases when
    someone is at the very top of the frame (far away).
    """
    return max(20.0, slope * cy + intercept)


# =============================================================================
# STEP 3 — Vulnerability Tagging
# =============================================================================

def tag_vulnerable_persons(state: GlobalState):
    """
    For each tracked person, compare their actual bounding box height
    against the expected height from the ground plane model at their Y position.

    If actual_height < VULNERABILITY_RATIO * expected_height:
        → Tag as VULNERABLE (likely fallen, crouching, or a child)

    The VULNERABILITY_RATIO (default 0.80) means "less than 80% of the
    expected height for their depth zone." This threshold is tunable in config.py.

    Why relative height instead of absolute?
    Because we don't know the camera's intrinsic parameters or mounting height,
    we can't compute real-world heights. But we CAN say: "this person is
    significantly shorter than everyone else at the same distance." That's
    what makes someone stand out as potentially on the ground.
    """
    slope     = state.ground_plane_slope
    intercept = state.ground_plane_intercept

    for person in state.persons.values():
        exp_h = expected_height(person.current_cy, slope, intercept)
        threshold = VULNERABILITY_RATIO * exp_h

        # A person is vulnerable if their bbox height is anomalously small
        person.is_vulnerable = (person.current_height < threshold)


# =============================================================================
# STEP 4 — Velocity Computation
# =============================================================================

def compute_velocities(state: GlobalState):
    """
    Delegate to each PersonTrack's own compute_velocity() method.
    We do this in analytics.py (rather than inside PersonTrack.update_position)
    so that velocity computation is part of the analytics pipeline and can be
    conditionally skipped (e.g., for performance profiling).

    The result: each person has valid velocity_x, velocity_y, speed fields
    that represent their smoothed motion over the last TRACK_HISTORY_LENGTH frames.
    """
    for person in state.persons.values():
        person.compute_velocity(min_movement=MIN_MOVEMENT_THRESHOLD)


# =============================================================================
# STEP 5 — Grid Population & Force Accumulation
# =============================================================================

def accumulate_grid_forces(state: GlobalState):
    """
    Two things happen here in a single pass over all persons:

    1. POPULATION COUNT: Increment grid_population[row, col] for each person.
       This gives us the "how many people are in this cell" count needed
       for crowding detection.

    2. FORCE ACCUMULATION: Add each person's velocity vector to
       grid_force[row, col]. The sum of all velocity vectors in a cell
       gives us the NET force direction — the direction the crowd "wants to go."

    Why net force instead of average?
    Because magnitude matters. A cell where 10 people are all sprinting
    right should have a much stronger rightward force than one where 2 people
    are leisurely walking right. The sum naturally encodes this.

    After this step, grid_force[r, c] = [sum_vx, sum_vy] for all persons
    in cell (r, c). This is later normalized per-cell for the DFS direction
    logic.
    """
    for person in state.persons.values():
        r = person.current_grid_row
        c = person.current_grid_col

        # Increment population
        state.grid_population[r, c] += 1

        # Accumulate force vector
        state.grid_force[r, c, 0] += person.velocity_x
        state.grid_force[r, c, 1] += person.velocity_y


# =============================================================================
# STEP 6 — Squeeze Detection
# =============================================================================

def detect_squeeze_cells(state: GlobalState):
    """
    A "squeeze" is when people in a cell are moving TOWARD each other —
    converging rather than dispersing. This is the most dangerous crowd
    dynamic: it's what causes crushing injuries.

    Detection Algorithm:
    For each crowded cell (r, c), look at every person inside it.
    For each person, compute the vector from their position to the cell center.
    This "centripetal vector" points toward the center of the cell.
    Then compute the dot product of the person's velocity with the centripetal vector.
    If this dot product is POSITIVE, the person is moving TOWARD the center (inward).

    Average the dot products across all people in the cell. If the average
    exceeds SQUEEZE_DOT_THRESHOLD, the cell is "squeezing."

    Mathematically:
        centripetal = (cell_center - person_pos) normalized
        dot = velocity_normalized · centripetal
        If mean(dot) > threshold → SQUEEZE

    We tag the cell STATE_SQUEEZE in the grid. The DFS will also propagate
    from squeeze cells, since they're under active pressure.
    """
    fw = state.frame_width
    fh = state.frame_height

    # Cell dimensions in pixels
    cell_w = fw / GRID_COLS
    cell_h = fh / GRID_ROWS

    for r in range(GRID_ROWS):
        for c in range(GRID_COLS):
            if state.grid_population[r, c] < MIN_PEOPLE_FOR_SQUEEZE:
                continue  # Not enough people to measure squeeze

            # Get the pixel-space center of this grid cell
            cell_center_x = (c + 0.5) * cell_w
            cell_center_y = (r + 0.5) * cell_h

            # Find all persons in this cell
            persons_in_cell = [
                p for p in state.persons.values()
                if p.current_grid_row == r and p.current_grid_col == c
            ]

            if len(persons_in_cell) < MIN_PEOPLE_FOR_SQUEEZE:
                continue

            dot_products = []
            for person in persons_in_cell:
                if person.speed < MIN_MOVEMENT_THRESHOLD:
                    continue  # Stationary person — no meaningful direction

                # Vector from person to cell center (centripetal direction)
                to_center_x = cell_center_x - person.current_cx
                to_center_y = cell_center_y - person.current_cy
                to_center_len = np.sqrt(to_center_x**2 + to_center_y**2)

                if to_center_len < 1e-6:
                    continue  # Person is exactly at cell center

                # Normalize both vectors before dot product
                # (so we measure DIRECTION alignment, not speed magnitude)
                to_center_norm = np.array([to_center_x, to_center_y]) / to_center_len
                vel_len = person.speed
                vel_norm = np.array([person.velocity_x, person.velocity_y]) / vel_len

                dot = float(np.dot(vel_norm, to_center_norm))
                dot_products.append(dot)

            if not dot_products:
                continue

            avg_dot = np.mean(dot_products)

            # If average dot product exceeds threshold → inward converging motion
            if avg_dot > SQUEEZE_DOT_THRESHOLD:
                # Only mark as squeeze if the cell is already crowded
                # (squeeze in a sparse cell is not a concern)
                if state.grid_population[r, c] >= CROWDING_THRESHOLD:
                    state.grid[r, c] = STATE_SQUEEZE


# =============================================================================
# STEP 7 — Grid State Assignment
# =============================================================================

def assign_grid_states(state: GlobalState):
    """
    Set the STATE_* value for each grid cell based on its population,
    vulnerability status, and squeeze detection.

    Priority order (highest wins):
        CRITICAL  > SQUEEZE > CROWDED > OCCUPIED > EMPTY

    The squeeze state is ALREADY set in detect_squeeze_cells() for cells
    that qualify. Here we handle EMPTY → OCCUPIED → CROWDED → CRITICAL
    transitions, and we don't downgrade a SQUEEZE cell.

    Why check vulnerability per cell?
    A CRITICAL cell is defined as: CROWDED + at least one vulnerable person.
    This is the trigger for DFS shockwave propagation, because it means
    a helpless person is in a dangerously dense area.
    """
    for r in range(GRID_ROWS):
        for c in range(GRID_COLS):
            pop = state.grid_population[r, c]

            if pop == 0:
                state.grid[r, c] = STATE_EMPTY
                continue

            # Determine base state from population
            if pop >= CROWDING_THRESHOLD:
                base_state = STATE_CROWDED
            else:
                base_state = STATE_OCCUPIED

            # Check if any vulnerable person is in this crowded cell
            if base_state == STATE_CROWDED:
                has_vulnerable = any(
                    p.is_vulnerable
                    for p in state.persons.values()
                    if p.current_grid_row == r and p.current_grid_col == c
                )
                if has_vulnerable:
                    state.grid[r, c] = STATE_CRITICAL
                    state.critical_cells.add((r, c))
                    continue  # CRITICAL wins over SQUEEZE

            # Don't downgrade a cell that squeeze detection already upgraded
            if state.grid[r, c] == STATE_SQUEEZE:
                continue

            state.grid[r, c] = base_state


# =============================================================================
# STEP 8 — Directional DFS Shockwave Propagation
# =============================================================================

def get_dominant_neighbor(
    row: int, col: int,
    force_x: float, force_y: float
) -> Optional[tuple[int, int]]:
    """
    Given a cell's net force vector (force_x, force_y), determine which
    of its 4 neighbors (up, down, left, right) the force is most strongly
    pointing toward.

    This is how we make the shockwave DIRECTIONAL instead of omnidirectional.
    Instead of blindly flood-filling all neighboring crowded cells, we prefer
    the neighbor that the crowd force is pushing toward.

    The algorithm:
        For each of the 4 cardinal neighbors, compute the direction vector
        from (row, col) to (neighbor_row, neighbor_col). Take the dot product
        with the normalized force vector. The neighbor with the highest
        dot product is the one the force is pointing toward most strongly.

    Returns the (row, col) of the dominant neighbor, or None if the force
    magnitude is essentially zero (cell has no directional pressure).
    """
    force_magnitude = np.sqrt(force_x**2 + force_y**2)
    if force_magnitude < 1e-6:
        return None  # No meaningful direction — omnidirectional spread

    # Normalize force vector
    fx = force_x / force_magnitude
    fy = force_y / force_magnitude

    # 4-connected neighbors: (delta_row, delta_col)
    # In image coordinates, Y increases downward.
    # force_y > 0 means crowd moving DOWN → neighbor below (row+1)
    neighbors = [
        (row - 1, col,     0.0, -1.0),   # up    → force direction (0, -1)
        (row + 1, col,     0.0,  1.0),   # down  → force direction (0, +1)
        (row,     col - 1, -1.0, 0.0),   # left  → force direction (-1, 0)
        (row,     col + 1,  1.0, 0.0),   # right → force direction (+1, 0)
    ]

    best_neighbor = None
    best_dot      = -np.inf

    for nr, nc, dir_x, dir_y in neighbors:
        # Skip out-of-bounds neighbors
        if not (0 <= nr < GRID_ROWS and 0 <= nc < GRID_COLS):
            continue
        dot = fx * dir_x + fy * dir_y
        if dot > best_dot:
            best_dot      = dot
            best_neighbor = (nr, nc)

    return best_neighbor


def run_dfs_shockwave(state: GlobalState):
    """
    Propagate the pressure shockwave using an iterative DFS starting from
    all CRITICAL and SQUEEZE cells (the "seeds").

    Key innovation: DIRECTIONAL propagation.
    Standard flood-fill visits ALL crowded neighbors. Our DFS uses the
    net force vector of each cell to decide which neighbor to visit FIRST
    (and preferentially). This means the shockwave travels in the direction
    the crowd is actually being compressed toward — physically meaningful.

    Algorithm:
        1. Seed the stack with all CRITICAL cells (highest danger sources).
        2. Also seed SQUEEZE cells as secondary sources.
        3. For each cell popped from the stack:
           a. Mark it as SHOCKWAVE (unless it's CRITICAL — preserve that color).
           b. Find the dominant neighbor based on the cell's force vector.
           c. If the dominant neighbor is CROWDED/OCCUPIED and not yet visited,
              push it with depth+1.
           d. Also push other crowded neighbors (non-dominant) with depth+2
              to simulate the wave spreading more slowly in non-force directions.
        4. Stop when depth > MAX_SHOCKWAVE_DEPTH or stack is empty.

    The depth limit prevents the entire grid from lighting up on one frame
    when a large crowd is detected. It creates a "wave front" effect.
    """
    # Stack entries: (row, col, depth)
    stack: list[tuple[int, int, int]] = []
    visited: set[tuple[int, int]] = set()

    # Seed from critical cells (highest priority)
    for (r, c) in state.critical_cells:
        stack.append((r, c, 0))
        visited.add((r, c))

    # Also seed from squeeze cells (secondary sources)
    for r in range(GRID_ROWS):
        for c in range(GRID_COLS):
            if state.grid[r, c] == STATE_SQUEEZE and (r, c) not in visited:
                stack.append((r, c, 0))
                visited.add((r, c))

    while stack:
        r, c, depth = stack.pop()

        if depth > MAX_SHOCKWAVE_DEPTH:
            continue

        # Mark as shockwave, but don't overwrite CRITICAL cells
        # (we want them to remain red, not turn magenta)
        if state.grid[r, c] not in (STATE_CRITICAL, STATE_SQUEEZE):
            state.grid[r, c] = STATE_SHOCKWAVE
            state.shockwave_cells.add((r, c))

        # Get this cell's force vector
        fx = float(state.grid_force[r, c, 0])
        fy = float(state.grid_force[r, c, 1])

        # Find the dominant neighbor (direction the force is pushing)
        dominant = get_dominant_neighbor(r, c, fx, fy)

        # Visit all 4 neighbors, but prioritize the dominant one
        cardinal_neighbors = [
            (r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)
        ]

        for nr, nc in cardinal_neighbors:
            if not (0 <= nr < GRID_ROWS and 0 <= nc < GRID_COLS):
                continue
            if (nr, nc) in visited:
                continue

            cell_state = state.grid[nr, nc]

            # Only propagate into cells that have people (occupied or crowded)
            # Empty cells act as "walls" that stop the shockwave.
            # This is physically correct: pressure doesn't propagate through empty space.
            if cell_state in (STATE_OCCUPIED, STATE_CROWDED,
                               STATE_SQUEEZE, STATE_CRITICAL):
                visited.add((nr, nc))

                # Dominant neighbor gets the SAME depth → propagates at full speed
                # Other neighbors get depth+1 → propagate one step slower
                if dominant and (nr, nc) == dominant:
                    stack.append((nr, nc, depth))
                else:
                    stack.append((nr, nc, depth + 1))


# =============================================================================
# MASTER PIPELINE — Call this once per frame from main_app.py
# =============================================================================

def run_analytics_pipeline(
    detections: list[dict],
    state: GlobalState,
    frame_num: int
):
    """
    The single entry point for all analytics. Call this every frame with the
    fresh detection list from vision.py. It runs all 9 steps in order and
    leaves state fully updated and ready for the UI to render.

    This function is designed to be called from main_app.py like:
        run_analytics_pipeline(detections, state, state.frame_count)

    After this call:
        - state.persons has updated positions, velocities, and vulnerability flags
        - state.grid has the full STATE_* map
        - state.shockwave_cells has the current pressure wave cells
        - All metrics on state are up-to-date

    Args:
        detections: List of detection dicts from vision.get_detections()
        state:      The GlobalState singleton
        frame_num:  Current frame index (for staleness tracking)
    """
    # ------------------------------------------------------------------
    # Pre-frame cleanup
    # ------------------------------------------------------------------
    state.frame_count = frame_num
    state.reset_grid()             # Zero out grid arrays (keeps persons dict)
    state.prune_stale_persons()    # Remove tracks not seen for ~1 second

    # ------------------------------------------------------------------
    # Step 1: Population Mapping
    # Update PersonTrack positions and compute grid cell assignments
    # ------------------------------------------------------------------
    map_persons_to_grid(detections, state, frame_num)

    # ------------------------------------------------------------------
    # Step 2: Ground Plane Fitting
    # Fit linear model: height = m * cy + c
    # ------------------------------------------------------------------
    fit_ground_plane(state)

    # ------------------------------------------------------------------
    # Step 3: Vulnerability Tagging
    # Mark persons whose height is anomalously small for their depth
    # ------------------------------------------------------------------
    tag_vulnerable_persons(state)

    # ------------------------------------------------------------------
    # Step 4: Velocity Computation
    # Smooth velocity vectors from position history
    # ------------------------------------------------------------------
    compute_velocities(state)

    # ------------------------------------------------------------------
    # Step 5: Grid Force Accumulation
    # Sum population counts and velocity vectors per cell
    # ------------------------------------------------------------------
    accumulate_grid_forces(state)

    # ------------------------------------------------------------------
    # Step 6: Squeeze Detection
    # Detect cells where forces are converging inward
    # ------------------------------------------------------------------
    detect_squeeze_cells(state)

    # ------------------------------------------------------------------
    # Step 7: Grid State Assignment
    # Assign STATE_EMPTY/OCCUPIED/CROWDED/CRITICAL based on pop + flags
    # ------------------------------------------------------------------
    assign_grid_states(state)

    # ------------------------------------------------------------------
    # Step 8: DFS Shockwave Propagation
    # Spread pressure from Critical/Squeeze cells along force directions
    # ------------------------------------------------------------------
    run_dfs_shockwave(state)

    # ------------------------------------------------------------------
    # Step 9: Metrics Update
    # Recompute all summary counts for the dashboard
    # ------------------------------------------------------------------
    state.update_metrics()