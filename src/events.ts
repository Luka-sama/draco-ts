import {Events, Socket} from "./ws";

/** Object with router events */
const events: Events = {
	"say hello": (sck: Socket, b: string) => sck.emit("kwa", "hallo " + b)
};
export default events;