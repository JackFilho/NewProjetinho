import { storage } from "./storage";

let archiveInterval: NodeJS.Timeout | null = null;

export function startAutoArchiveScheduler() {
  if (archiveInterval) {
    clearInterval(archiveInterval);
  }

  console.log("📦 Starting auto-archive scheduler for treatment packages...");

  // Run every 24 hours
  archiveInterval = setInterval(async () => {
    try {
      await processAutoArchive();
    } catch (error) {
      console.error("Error in auto-archive scheduler:", error);
    }
  }, 86400000); // 24 hours

  // Run on startup after 10 seconds
  setTimeout(() => {
    processAutoArchive().catch(console.error);
  }, 10000);
}

export function stopAutoArchiveScheduler() {
  if (archiveInterval) {
    clearInterval(archiveInterval);
    archiveInterval = null;
    console.log("🛑 Auto-archive scheduler stopped");
  }
}

async function processAutoArchive() {
  try {
    const count = await storage.autoArchiveOldPackages();
    if (count > 0) {
      console.log(`📦 Auto-archived ${count} treatment package(s) (completed/cancelled > 3 months)`);
    }
  } catch (error) {
    console.error("Error processing auto-archive:", error);
  }
}
