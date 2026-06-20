import type { BetGameProps } from "../../../types";
import { SlotMachine, type SlotSymbol } from "./SlotMachine";

const SYMBOLS: SlotSymbol[] = [
  { id: "ox", icon: "🐂", mult: 70, weight: 4, wild: true },
  { id: "env", icon: "🧧", mult: 32, weight: 7 },
  { id: "bag", icon: "💰", mult: 20, weight: 10 },
  { id: "lan", icon: "🏮", mult: 13, weight: 13 },
  { id: "coin", icon: "🪙", mult: 9, weight: 16 },
  { id: "bell", icon: "🔔", mult: 6, weight: 19 },
  { id: "orange", icon: "🍊", mult: 4, weight: 24 },
];

export const meta = { id: "fortune_ox", defaultLabel: "Fortune Ox", defaultIcon: "🐂" };

export default function FortuneOx(props: BetGameProps) {
  return <SlotMachine {...props} symbols={SYMBOLS} />;
}
