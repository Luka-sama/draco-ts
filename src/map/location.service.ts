import {EM} from "../ws";
import Location from "./location.entity";

export default class LocationService {
	constructor(
		private location: Location
	) {}

	async load(em: EM) {

	}
}