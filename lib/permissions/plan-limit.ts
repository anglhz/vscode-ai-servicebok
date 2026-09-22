export class PlanLimitError extends Error {}
export function checkPlanLimit(error: { code?: string } | null) {
  if (error?.code === "P1001") throw new PlanLimitError("Free tillåter ett aktivt fordon. Premium krävs för fler fordon.");
  if (error?.code === "P1002") throw new PlanLimitError("Dokumentutrymmet räcker inte. Frigör utrymme eller välj Premium för högre kapacitet.");
}
