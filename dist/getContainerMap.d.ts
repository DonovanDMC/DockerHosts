import Docker from "dockerode";
export default function getContainerMap(options?: Docker.DockerOptions, keepPeriods?: boolean): Promise<Record<string, string>>;
