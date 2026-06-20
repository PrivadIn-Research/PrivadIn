import type { BetGameProps } from "../../../types";
import { CrashGame } from "./CrashGame";

export const meta = { id: "spaceman", defaultLabel: "Spaceman", defaultIcon: "👨‍🚀" };

export default function Spaceman(props: BetGameProps) {
  return <CrashGame {...props} emoji="👨‍🚀" growth={0.45} />;
}
