const { emitVolunteerTask } = require('./socketService');
const logger = require('../utils/logger');
const admin = require('firebase-admin');

/**
 * Auto-assign the nearest available volunteer in a zone (or nearby zones) to a task.
 */
const autoAssignVolunteer = async (zone, task, taskRefId = null, taskRefModel = null, epicenterCoords = null) => {
  try {
    const updateObj = {
      status: 'busy',
      currentTask: task,
      taskAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
      taskReference: taskRefId,
      taskRefModel: taskRefModel,
    };

    // Helper to safely claim one volunteer using Transactions to avoid race conditions
    const claimFirstAvailable = async (querySnapshot) => {
      for (const docSnapshot of querySnapshot.docs) {
        const ref = docSnapshot.ref;
        try {
          const result = await global.db.runTransaction(async (t) => {
            const doc = await t.get(ref);
            if (doc.data().status !== 'available') {
              throw new Error('CONTENTION'); // Someone else claimed them first
            }
            t.update(ref, updateObj);
            return doc.data();
          });
          return { _id: ref.id, id: ref.id, ...result };
        } catch (e) {
          // If contention occurred, simply try the next volunteer in the snapshot
          if (e.message !== 'CONTENTION') throw e; 
        }
      }
      return null;
    };

    // 1. Find available volunteers in the specific zone
    let snapshot = await global.db.collection('volunteers')
      .where('zone', '==', zone.toUpperCase())
      .where('status', '==', 'available')
      .limit(10) // fetch a small batch to try
      .get();

    let chosen = await claimFirstAvailable(snapshot);

    // 2. Fallback to anywhere if no local volunteers
    if (!chosen) {
      snapshot = await global.db.collection('volunteers')
        .where('status', '==', 'available')
        .limit(10)
        .get();
        
      chosen = await claimFirstAvailable(snapshot);
    }

    if (!chosen) {
      logger.warn(`No available volunteers for task: ${task} in zone: ${zone}`);
      return null;
    }

    // 3. Notify volunteer via socket
    if (chosen.user && chosen.user.uid) {
      emitVolunteerTask(chosen.user.uid, {
        task,
        zone: zone.toUpperCase(),
        taskRefId,
        message: `You have been assigned a new task: ${task.replace(/_/g, ' ')} in Zone ${zone.toUpperCase()}`,
      });
    }

    logger.info(`Volunteer ${chosen.id} (${chosen.user?.name}) assigned to ${task}`);
    return chosen;

  } catch (err) {
    logger.error(`autoAssignVolunteer error: ${err.message}`);
    return null;
  }
};

/**
 * Release a volunteer back to 'available' status after task completion.
 */
const releaseVolunteer = async (volunteerId) => {
  try {
    const docRef = global.db.collection('volunteers').doc(volunteerId);
    
    await global.db.runTransaction(async (t) => {
      const doc = await t.get(docRef);
      if (!doc.exists) return;
      
      t.update(docRef, {
        status: 'available',
        currentTask: 'none',
        taskAssignedAt: null,
        taskReference: null,
        taskRefModel: null,
        completedTasks: admin.firestore.FieldValue.increment(1),
      });
    });
    
    logger.info(`Volunteer ${volunteerId} released`);
  } catch (err) {
    logger.error(`releaseVolunteer error: ${err.message}`);
  }
};

module.exports = { autoAssignVolunteer, releaseVolunteer };
