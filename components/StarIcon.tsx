import {
  IconStar,
  IconStarFilled,
  IconStarHalfFilled,
} from '@tabler/icons-react';
import { useMemo } from 'react';
import { i18n } from '#i18n';

type Props = {
  score?: number;
  size?: number;
  interactive?: boolean;
  onSelect?: (value: number) => void;
};

const StarIcons = ({ score = 0, size = 24, interactive = false, onSelect }: Props) => {
  const starArr = useMemo(() => new Array(5).fill(0), []);

  return (
    <div className="flex flex-row gap-0.5">
      {starArr.map((_, idx) => {
        const baseValue = idx * 2;
        const fill = Math.max(0, Math.min(1, (score - baseValue) / 2));
        const isFilled = fill >= 1;
        const isHalf = fill > 0 && fill < 1;
        const color = fill > 0 ? "text-yellow-500" : "text-slate-200";

        let StarIcon = IconStar;
        if (isFilled) {
          StarIcon = IconStarFilled;
        } else if (isHalf) {
          StarIcon = IconStarHalfFilled;
        }

        return (
          <div key={`star_${idx}`} className="relative inline-flex items-center justify-center">
            <StarIcon className={`block aspect-square ${color}`} size={size} />
            {interactive && onSelect && (
              <>
                <button
                  type="button"
                  className="absolute inset-y-0 left-0 w-1/2 cursor-pointer bg-transparent"
                  aria-label={i18n.t("aria.scorePoint", { value: baseValue + 1 })}
                  onClick={() => onSelect(baseValue + 1)}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 w-1/2 cursor-pointer bg-transparent"
                  aria-label={i18n.t("aria.scorePoint", { value: baseValue + 2 })}
                  onClick={() => onSelect(baseValue + 2)}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default StarIcons;
