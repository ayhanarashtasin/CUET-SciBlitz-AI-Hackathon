const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const IeltsWritingSet = require('../models/IeltsWritingSet');
const { deleteLocalFile } = require('../services/ieltsService');

async function deleteAllWritingSets() {
  try {
    await connectDB();
    console.log('Fetching all IELTS Writing Question sets...');

    const writingSets = await IeltsWritingSet.find({});
    console.log(`Found ${writingSets.length} IELTS writing question sets to delete.`);

    if (writingSets.length === 0) {
      console.log('No IELTS writing question sets found. Nothing to delete.');
      process.exit(0);
    }

    let filesDeleted = 0;
    for (const set of writingSets) {
      if (set.task1?.pdfUrl) {
        deleteLocalFile(set.task1.pdfUrl);
        filesDeleted++;
      }
      if (set.task1?.imageUrl) {
        deleteLocalFile(set.task1.imageUrl);
        filesDeleted++;
      }
      if (set.task2?.pdfUrl) {
        deleteLocalFile(set.task2.pdfUrl);
        filesDeleted++;
      }
      if (set.task2?.imageUrl) {
        deleteLocalFile(set.task2.imageUrl);
        filesDeleted++;
      }
    }

    const deleteResult = await IeltsWritingSet.deleteMany({});
    console.log(`Successfully deleted ${deleteResult.deletedCount} IELTS writing question sets.`);
    console.log(`Cleaned up ${filesDeleted} associated local files.`);

    process.exit(0);
  } catch (err) {
    console.error('Error deleting IELTS writing question sets:', err);
    process.exit(1);
  }
}

deleteAllWritingSets();
