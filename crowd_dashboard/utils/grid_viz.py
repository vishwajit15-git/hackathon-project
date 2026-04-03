# =============================================================================
# utils/grid_viz.py — Plotly Grid Heatmap Builder
# =============================================================================
# Converts the numpy grid matrix from state into a Plotly figure that
# renders as a real-time heatmap in the Streamlit right column.
#
# Why Plotly instead of matplotlib?
# Plotly renders as an interactive HTML widget in Streamlit, which means:
#   - No flickering on re-render (matplotlib creates new PNG images each frame)
#   - Hover tooltips work automatically (operators can inspect cell values)
#   - Much smoother animation feel in the dashboard
#
# The figure is rebuilt from scratch every frame. This is fast enough for
# a 20x20 grid (400 cells) — Plotly handles it in milliseconds.
# =============================================================================

import numpy as np
import plotly.graph_objects as go
from core.state import GlobalState
from config import (
    GRID_ROWS, GRID_COLS,
    CELL_COLORS,
    STATE_EMPTY, STATE_OCCUPIED, STATE_CROWDED,
    STATE_SQUEEZE, STATE_CRITICAL, STATE_SHOCKWAVE
)


# Plotly's heatmap colorscale format:
# List of [normalized_value, color_string] pairs.
# We map each STATE integer to its color from config.CELL_COLORS.
# The values are normalized to 0.0–1.0 range over STATE_EMPTY to STATE_SHOCKWAVE.
_MAX_STATE = STATE_SHOCKWAVE  # = 5

PLOTLY_COLORSCALE = [
    [i / _MAX_STATE, CELL_COLORS[i]]
    for i in range(len(CELL_COLORS))
]

# State name labels for hover tooltips
_STATE_LABELS = {
    STATE_EMPTY:     "Empty",
    STATE_OCCUPIED:  "Occupied",
    STATE_CROWDED:   "Crowded",
    STATE_SQUEEZE:   "Squeeze ⚠",
    STATE_CRITICAL:  "CRITICAL 🚨",
    STATE_SHOCKWAVE: "Shockwave 🌊",
}


def build_grid_hover_text(state: GlobalState) -> list[list[str]]:
    """
    Build a 2D list of hover text strings for the Plotly heatmap.
    Each cell shows: state name, population count, and net force vector.

    This is what operators see when they mouse over a cell in the dashboard.
    For a hackathon demo, this is surprisingly impressive — it shows the
    technical depth of the system without requiring any explanation.
    """
    hover = []
    for r in range(GRID_ROWS):
        row_text = []
        for c in range(GRID_COLS):
            cell_state = int(state.grid[r, c])
            pop        = int(state.grid_population[r, c])
            fx         = float(state.grid_force[r, c, 0])
            fy         = float(state.grid_force[r, c, 1])
            force_mag  = float(np.sqrt(fx**2 + fy**2))

            state_name = _STATE_LABELS.get(cell_state, "Unknown")

            text = (
                f"Cell ({r},{c})<br>"
                f"State: {state_name}<br>"
                f"People: {pop}<br>"
                f"Force: ({fx:.1f}, {fy:.1f}) mag={force_mag:.1f}"
            )
            row_text.append(text)
        hover.append(row_text)
    return hover


def build_grid_figure(state: GlobalState) -> go.Figure:
    """
    Build a complete Plotly figure representing the current grid state.

    The figure is a heatmap where:
      - Cell color encodes STATE_* (from dark blue = empty to magenta = shockwave)
      - Hover text shows detailed cell info (state, population, force vector)
      - Annotations show population counts on non-empty cells
      - The layout is dark-themed to match the dashboard aesthetic

    The function also adds a secondary scatter trace to mark critical cells
    with a bright red X marker, making them visually unmissable.

    Returns a go.Figure ready to be passed to st.plotly_chart().
    """
    # Flip grid vertically so row 0 appears at the BOTTOM of the chart,
    # matching screen coordinates where y=0 is at the top.
    # Without this flip, the grid appears upside-down relative to the video feed.
    z_data    = np.flipud(state.grid).astype(float)
    hover_data = list(reversed(build_grid_hover_text(state)))

    # Build the base heatmap
    heatmap = go.Heatmap(
        z=z_data,
        text=hover_data,
        hoverinfo="text",
        colorscale=PLOTLY_COLORSCALE,
        zmin=0,
        zmax=_MAX_STATE,
        showscale=False,           # Hide the colorbar (we have a legend below)
        xgap=1,                    # 1px gap between cells → visible grid lines
        ygap=1,
    )

    # Add population count annotations on non-empty cells
    # (only for GRID_ROWS * GRID_COLS <= 400 — otherwise too dense to read)
    annotations = []
    if GRID_ROWS * GRID_COLS <= 400:
        for r in range(GRID_ROWS):
            for c in range(GRID_COLS):
                pop = int(state.grid_population[r, c])
                if pop > 0:
                    # Plotly heatmap y-axis: index 0 is at bottom after flipud.
                    # So the annotation y for grid row r is (GRID_ROWS - 1 - r).
                    annotations.append(dict(
                        x=c,
                        y=GRID_ROWS - 1 - r,
                        text=str(pop),
                        showarrow=False,
                        font=dict(
                            color="white",
                            size=8,
                            family="monospace"
                        )
                    ))

    # Critical cell markers: bright red X on top of the heatmap
    critical_xs = []
    critical_ys = []
    for (r, c) in state.critical_cells:
        critical_xs.append(c)
        critical_ys.append(GRID_ROWS - 1 - r)  # Flip y to match heatmap

    critical_scatter = go.Scatter(
        x=critical_xs,
        y=critical_ys,
        mode="markers",
        marker=dict(
            symbol="x",
            size=14,
            color="white",
            line=dict(color="red", width=2)
        ),
        hoverinfo="skip",
        name="Critical"
    )

    # Shockwave cell markers: subtle wave symbol
    shock_xs = [c for (r, c) in state.shockwave_cells]
    shock_ys = [GRID_ROWS - 1 - r for (r, c) in state.shockwave_cells]

    shockwave_scatter = go.Scatter(
        x=shock_xs,
        y=shock_ys,
        mode="markers",
        marker=dict(
            symbol="circle-open",
            size=10,
            color="white",
            line=dict(color="magenta", width=1.5)
        ),
        hoverinfo="skip",
        name="Shockwave"
    )

    # Assemble figure
    fig = go.Figure(data=[heatmap, critical_scatter, shockwave_scatter])

    fig.update_layout(
        # Dark background to match dashboard theme
        paper_bgcolor="#0d0d1a",
        plot_bgcolor="#0d0d1a",

        # Remove axis labels (grid coordinates aren't meaningful to operators)
        xaxis=dict(
            showticklabels=False,
            showgrid=False,
            zeroline=False,
            range=[-0.5, GRID_COLS - 0.5]
        ),
        yaxis=dict(
            showticklabels=False,
            showgrid=False,
            zeroline=False,
            range=[-0.5, GRID_ROWS - 0.5],
            scaleanchor="x",    # Keep cells square
            scaleratio=1,
        ),

        margin=dict(l=0, r=0, t=0, b=0),
        showlegend=False,
        annotations=annotations,

        # Fixed size for consistent Streamlit layout
        width=440,
        height=440,
    )

    return fig


def build_legend_html() -> str:
    """
    Returns an HTML string for a color legend panel shown below the grid.
    Streamlit renders this with st.markdown(..., unsafe_allow_html=True).

    Why HTML instead of a Plotly legend?
    Plotly's built-in legend only shows trace names, not state descriptions.
    A custom HTML legend lets us write meaningful descriptions for each state,
    which is crucial for operators who aren't familiar with the system.
    """
    state_descriptions = [
        (CELL_COLORS[0], "Empty",         "No people present"),
        (CELL_COLORS[1], "Occupied",      "Below crowding threshold"),
        (CELL_COLORS[2], "Crowded",       f"≥ threshold persons"),
        (CELL_COLORS[3], "Squeeze ⚠",    "Converging inward pressure"),
        (CELL_COLORS[4], "CRITICAL 🚨",  "Crowded + vulnerable person"),
        (CELL_COLORS[5], "Shockwave 🌊", "Active pressure propagation"),
    ]

    rows = ""
    for color, name, desc in state_descriptions:
        rows += f"""
        <tr>
          <td style="width:16px; height:16px; background:{color};
                     border-radius:3px; border:1px solid #333;"></td>
          <td style="padding-left:8px; color:#eee; font-weight:600;
                     font-size:0.8em;">{name}</td>
          <td style="padding-left:12px; color:#aaa; font-size:0.75em;">{desc}</td>
        </tr>
        """

    return f"""
    <table style="border-collapse:separate; border-spacing:0 4px;
                  background:#0d0d1a; padding:8px; border-radius:6px;
                  width:100%;">
      {rows}
    </table>
    """