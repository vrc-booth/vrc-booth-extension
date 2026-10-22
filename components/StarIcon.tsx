import { IconStar, IconStarFilled, IconStarHalfFilled } from "@tabler/icons-react";
import { i18n } from "#i18n";

type Props = {
  score?: number;
  size?: number;
  interactive?: boolean;
  onSelect?: (value: number) => void;
};

const STAR_COUNT = 5;

/** Half-star granularity on the service's 0–10 scale. */
const StarIcons = ({ score = 0, size = 24, interactive = false, onSelect }: Props) => (
  <div
    className="flex flex-row gap-0.5"
    role={interactive ? undefined : "img"}
    aria-label={interactive ? undefined : i18n.t("aria.scorePoint", [score])}
  >
    {Array.from({ length: STAR_COUNT }, (_, index) => {
      const baseValue = index * 2;
      const fill = Math.max(0, Math.min(1, (score - baseValue) / 2));
      const Star = fill >= 1 ? IconStarFilled : fill > 0 ? IconStarHalfFilled : IconStar;
      return (
        <div key={index} className="relative inline-flex items-center justify-center">
          <Star className={`block aspect-square ${fill > 0 ? "text-yellow-500" : "text-slate-200"}`} size={size} aria-hidden="true" />
          {interactive && onSelect && [1, 2].map((offset) => (
            <button
              key={offset}
              type="button"
              aria-label={i18n.t("aria.scorePoint", [baseValue + offset])}
              className={`absolute inset-y-0 ${offset === 1 ? "left-0" : "right-0"} w-1/2 cursor-pointer bg-transparent focus-visible:outline-2 focus-visible:outline-[#fc4d50]`}
              onClick={() => onSelect(baseValue + offset)}
            />
          ))}
        </div>
      );
    })}
  </div>
);

export default StarIcons;
