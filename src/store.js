import { atom } from "jotai";
import { config } from "./config";

export const projectAtom = atom(config.projects[0]);
