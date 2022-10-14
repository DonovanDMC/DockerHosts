export default class HostsManager {
    static checkWrite(path: string): Promise<void>;
    static read(path: string): Promise<{
        raw: string[];
        parsed: {
            [x: string]: string;
        };
        startIndex: number;
        endIndex: number;
    }>;
    static write(path: string, suffix: string, entries: Record<string, string>): Promise<void>;
}
