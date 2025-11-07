import isDocker from "is-docker";
import { access, constants, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dataDir = isDocker() ? "/data" : fileURLToPath(new URL("../", import.meta.url));

class Config {
    static get dataDir(): string {
        return dataDir;
    }

    static get markers(): boolean {
        return this.template === "hosts" || (process.env.MARKERS === "1");
    }

    static get outFile(): string {
        const env = process.env.OUT_FILE;
        if (env) return env;
        if (this.template === "hosts") return `${dataDir}/hosts`;
        if (this.template === "dns-zone") return `${dataDir}/zone`;
        return `${dataDir}/result.txt`;
    }

    static get restartContainers(): Array<string> {
        const rc = process.env.RESTART_CONTAINERS;
        if (rc) {
            return rc.split(",").map(s => s.trim()).filter(Boolean);
        }
        return [];
    }

    static get singleRun(): boolean {
        return process.env.SINGLE_RUN === "1";
    }

    static get template(): string {
        return process.env.TEMPLATE || "hosts";
    }

    static async readTemplate(): Promise<string> {
        return readFile(`${dataDir}/templates/${this.template}.squirrelly`, "utf8");
    }
}

try {
    await access(Config.outFile, constants.R_OK | constants.W_OK);
} catch (err) {
    throw new Error(`Output file "${Config.outFile}" is either missing, or not readable/writable.`, { cause: err });
}

try {
    await Config.readTemplate();
} catch (err) {
    throw new Error(`Template "${Config.template}" could not be found or read.`, { cause: err });
}

export default Config;
