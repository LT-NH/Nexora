import React from 'react';

interface StarRatingProps {
  rating: number;
  count?: number;
}

const StarRating: React.FC<StarRatingProps> = ({ rating, count }) => {
  const stars = '★★★★★'
    .split('')
    .map((_, i) => (i < Math.round(rating) ? '★' : '☆'))
    .join('');

  return (
    <span className="text-amber-400">
      {stars}
      {count !== undefined && (
        <span className="text-gray-400 text-sm ml-1">({count})</span>
      )}
    </span>
  );
};

export default StarRating;
