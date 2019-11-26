import {RoomBattlePlayer} from "../room-battle";
import {BattleFactoryRoomBattle} from "./battlefactory-room-battle";
import {RandomPlayerAI} from '../../sim/tools/random-player-ai';
import { ObjectReadWriteStream } from "../../lib/streams";

export class BotRoomBattlePlayer extends RoomBattlePlayer {
	ai: RandomPlayerAI;

	constructor(game: BattleFactoryRoomBattle) {
		super(null, game, 2);
		const ai = new RandomPlayerAI(null!);
		this.ai = ai;
		ai.choose = (s) => this.choose(s);
		//void this.ai.start();
		//console.log('after start');
	}

	send(data: string) {
		this.ai.receive(data);
	}
	sendRoom(data: string) {
		this.send(data);
	}

	choose(choice: string) {
		const user = {
			id: 'guest bot',
		} as User;
		this.game.choose!(user, choice);
	}
}