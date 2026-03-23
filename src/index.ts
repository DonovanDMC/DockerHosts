import Config from "./Config.js";
import { start } from "./events.js";
import { refresh } from "./handle.js";
import { log } from "./util.js";

log("log", "Launched");
await refresh();

if (Config.singleRun) {
    log("log", "Launched in single-run mode, exiting..");
    process.exit(0);
}

start();
