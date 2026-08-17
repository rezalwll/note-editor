export const PATTERN_POINT_COUNT = 9;
export const MIN_PATTERN_LENGTH = 4;

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function normalizePattern(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const points = value.map((point) =>
    typeof point === "number" ? point : Number.NaN,
  );
  if (
    points.length < MIN_PATTERN_LENGTH ||
    points.length > PATTERN_POINT_COUNT ||
    points.some(
      (point) =>
        !Number.isInteger(point) || point < 0 || point >= PATTERN_POINT_COUNT,
    ) ||
    new Set(points).size !== points.length
  ) {
    return null;
  }

  return points.join("-");
}

export function normalizeVerificationCode(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const asciiValue = [...value.trim()]
    .map((character) => {
      const persianIndex = PERSIAN_DIGITS.indexOf(character);
      if (persianIndex >= 0) return String(persianIndex);
      const arabicIndex = ARABIC_INDIC_DIGITS.indexOf(character);
      return arabicIndex >= 0 ? String(arabicIndex) : character;
    })
    .join("");

  return /^\d{6}$/.test(asciiValue) ? asciiValue : null;
}

export function getIntermediatePatternPoint(
  previousPoint: number,
  nextPoint: number,
) {
  const previousRow = Math.floor(previousPoint / 3);
  const previousColumn = previousPoint % 3;
  const nextRow = Math.floor(nextPoint / 3);
  const nextColumn = nextPoint % 3;
  const rowSum = previousRow + nextRow;
  const columnSum = previousColumn + nextColumn;

  if (rowSum % 2 !== 0 || columnSum % 2 !== 0) {
    return null;
  }

  const middlePoint = (rowSum / 2) * 3 + columnSum / 2;
  return middlePoint === previousPoint || middlePoint === nextPoint
    ? null
    : middlePoint;
}

export function appendPatternPoint(
  currentPoints: readonly number[],
  nextPoint: number,
) {
  if (
    nextPoint < 0 ||
    nextPoint >= PATTERN_POINT_COUNT ||
    currentPoints.includes(nextPoint)
  ) {
    return [...currentPoints];
  }

  const previousPoint = currentPoints.at(-1);
  if (previousPoint === undefined) {
    return [nextPoint];
  }

  const intermediatePoint = getIntermediatePatternPoint(
    previousPoint,
    nextPoint,
  );
  return intermediatePoint !== null &&
    !currentPoints.includes(intermediatePoint)
    ? [...currentPoints, intermediatePoint, nextPoint]
    : [...currentPoints, nextPoint];
}

export function getSafeAppLockReturnPath(value: unknown) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/lock")
    ? value
    : "/workspace";
}

export function maskEmail(email: string | null | undefined) {
  if (!email) return null;
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return email;

  const visibleLength = Math.min(2, localPart.length);
  return `${localPart.slice(0, visibleLength)}${"•".repeat(
    Math.max(2, localPart.length - visibleLength),
  )}@${domain}`;
}
