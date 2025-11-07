import Dockerode from "dockerode";

// use env variable DOCKER_HOST
const Docker = new Dockerode();
export default Docker;
