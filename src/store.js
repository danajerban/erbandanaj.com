import { atom } from "jotai";
import { config } from "./config";

export const projectAtom = atom(config.projects[0]);
// Index into config.sections of the section the scroll offset rounds to.
// Written from the section-change branch in Experience.jsx; read by the menu.
export const sectionAtom = atom(0);
