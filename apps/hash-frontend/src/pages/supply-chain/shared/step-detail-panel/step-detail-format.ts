export function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  if (!year || !month) {
    return ym;
  }
  const monthLabel = months[Number.parseInt(month, 10) - 1];
  return monthLabel ? `${monthLabel} ${year}` : ym;
}

export function previousPeriodLabel(
  range: { from: string; to: string } | null | undefined,
): string {
  if (!range) {
    return "";
  }
  return `${formatMonthLabel(range.from)} – ${formatMonthLabel(range.to)}`;
}
