/**
 * Centralized icon definitions for Petri net entity types.
 *
 * Each entity has an outline icon (used in PropertiesPanel headers)
 * and optionally a filled icon (used in list item rows).
 */
import { FaCircle, FaSquare } from "react-icons/fa6";
import { GrVolumeControl } from "react-icons/gr";
import { LuCircle, LuMinus, LuSquare } from "react-icons/lu";
import { RiColorFilterFill, RiFormula } from "react-icons/ri";

/** Outline icons — used in PropertiesPanel headers */
export const PlaceIcon = LuCircle;
export const TransitionIcon = LuSquare;
export const ArcIcon = LuMinus;
export const ParameterIcon = GrVolumeControl;
export const TokenTypeIcon = RiColorFilterFill;
export const DifferentialEquationIcon = RiFormula;

/** Filled icons — used in list item rows */
export const PlaceFilledIcon = FaCircle;
export const TransitionFilledIcon = FaSquare;
