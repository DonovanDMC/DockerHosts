import { access, constants, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import isDocker from "is-docker";

const dataDir = isDocker() ? "/data" : fileURLToPath(new URL("../", import.meta.url));

export interface ReloadContainerAction {
    action: "exec" | "kill";
    value:  string;
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
class Config {
    static get applyContainers(): Array<string> {
        return [...new Set([...this.restartContainers, ...this.reloadContainers])];
    }

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

    static get reloadContainerActions(): Record<string, ReloadContainerAction> {
        const rc = process.env.RELOAD_CONTAINERS;
        if (!rc) return {};

        const specs = splitSpecs(rc);
        const actions: Record<string, ReloadContainerAction> = {};

        for (const spec of specs) {
            const [namePart, actionPart] = spec.split(":", 2).map(s => s.trim());
            if (!namePart) continue;

            if (!actionPart) {
                actions[namePart] = {
                    action: "kill",
                    value:  this.reloadSignal
                };
                continue;
            }

            const killMatch = /^kill\((.+)\)$/i.exec(actionPart);
            if (killMatch?.[1]) {
                actions[namePart] = {
                    action: "kill",
                    value:  killMatch[1].trim()
                };
                continue;
            }

            const execMatch = /^exec\((.+)\)$/i.exec(actionPart);
            if (execMatch?.[1]) {
                actions[namePart] = {
                    action: "exec",
                    value:  execMatch[1]
                };
                continue;
            }
        }
        return actions;
    }

    static get reloadContainers(): Array<string> {
        return Object.keys(this.reloadContainerActions);
    }

    static get reloadExecTimeoutMs(): number {
        const env = process.env.RELOAD_EXEC_TIMEOUT_MS;
        const timeout = Number.parseInt(env ?? "", 10);
        if (Number.isNaN(timeout) || timeout <= 0) return 10_000;
        return timeout;
    }

    static get reloadSignal(): string {
        return process.env.RELOAD_SIGNAL || "SIGUSR1";
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

function splitSpecs(input: string): Array<string> {
    const specs: Array<string> = [];
    let depth = 0;
    let start = 0;

    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        if (char === "(") depth += 1;
        else if (char === ")" && depth > 0) depth -= 1;
        else if (char === "," && depth === 0) {
            const spec = input.slice(start, i).trim();
            if (spec) specs.push(spec);
            start = i + 1;
        }
    }

    const last = input.slice(start).trim();
    if (last) specs.push(last);
    return specs;
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
