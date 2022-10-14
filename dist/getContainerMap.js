import Docker from "dockerode";
export default async function getContainerMap(options, keepPeriods = false) {
    const docker = new Docker(options);
    const containers = await docker.listContainers();
    const map = {};
    for (const container of containers) {
        let ipAddress;
        for (const network of Object.values(container.NetworkSettings.Networks)) {
            ipAddress = network.IPAddress;
        }
        if (!ipAddress) {
            console.log("No IP address found for container \"%s\", skipping..", container.Names[0]);
            continue;
        }
        const id = container.Id.slice(0, 12);
        map[id] = ipAddress;
        if (container.Names.length !== 0) {
            for (let name of container.Names) {
                if (!keepPeriods)
                    name = name.replace(/\./g, "-");
                map[name.slice(1)] = ipAddress;
            }
        }
    }
    return map;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0Q29udGFpbmVyTWFwLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2dldENvbnRhaW5lck1hcC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLE1BQU0sTUFBTSxXQUFXLENBQUM7QUFFL0IsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLFVBQVUsZUFBZSxDQUFDLE9BQThCLEVBQUUsV0FBVyxHQUFHLEtBQUs7SUFDN0YsTUFBTSxNQUFNLEdBQUcsSUFBSSxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDbkMsTUFBTSxVQUFVLEdBQUcsTUFBTSxNQUFNLENBQUMsY0FBYyxFQUFFLENBQUM7SUFDakQsTUFBTSxHQUFHLEdBQTJCLEVBQUUsQ0FBQztJQUN2QyxLQUFLLE1BQU0sU0FBUyxJQUFJLFVBQVUsRUFBRTtRQUNoQyxJQUFJLFNBQTZCLENBQUM7UUFDbEMsS0FBSyxNQUFNLE9BQU8sSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDckUsU0FBUyxHQUFHLE9BQU8sQ0FBQyxTQUFTLENBQUM7U0FDakM7UUFDRCxJQUFJLENBQUMsU0FBUyxFQUFFO1lBQ1osT0FBTyxDQUFDLEdBQUcsQ0FBQyxzREFBc0QsRUFBRSxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDeEYsU0FBUztTQUNaO1FBQ0QsTUFBTSxFQUFFLEdBQUcsU0FBUyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3JDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxTQUFTLENBQUM7UUFDcEIsSUFBSSxTQUFTLENBQUMsS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7WUFDOUIsS0FBSyxJQUFJLElBQUksSUFBSSxTQUFTLENBQUMsS0FBSyxFQUFFO2dCQUM5QixJQUFJLENBQUMsV0FBVztvQkFBRSxJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQ2xELEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsU0FBUyxDQUFDO2FBQ2xDO1NBQ0o7S0FDSjtJQUNELE9BQU8sR0FBRyxDQUFDO0FBQ2YsQ0FBQyJ9