export function printOttoAgentStreamEvent(raw: string, _debug: boolean): void {
  const line = raw.trim();
  if (!line) return;
  console.log(line);
}
