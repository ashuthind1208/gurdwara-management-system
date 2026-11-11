// Both public displays use the same curated menu, never CMS grocery inventory.
export const selectedWelcomeDishes = (settings) => {
  const dishes = new Map((Array.isArray(settings.dishes) ? settings.dishes : []).map((dish) => [dish.id, dish]));
  return (Array.isArray(settings.selectedDishIds) ? settings.selectedDishIds : []).map((id) => dishes.get(id)).filter(Boolean);
};

export const WELCOME_THEMES = {
  navy: 'from-[#071b3a] via-[#103c72] to-[#071b3a]',
  blue: 'from-[#075985] via-[#0369a1] to-[#082f49]',
  warm: 'from-[#7c2d12] via-[#b45309] to-[#713f12]'
};