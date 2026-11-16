/** Short encouragement shown above the sign-in card, one picked at random per visit. */
export const MOTIVATION = [
  'You’re moving in the right direction.',
  'Keep applying. Your dream role is out there.',
  'Every application is a step closer.',
  'One good fit is all it takes.',
  'Small steps every day add up to an offer.',
  'Your experience is worth telling well.',
  'Rejection is redirection. Keep going.',
  'Today’s application could be the one.',
  'Progress beats perfection. Hit apply.',
  'You bring more to the table than you think.',
  'Consistency gets callbacks.',
  'The right team is looking for someone like you.',
  'Show up, tailor up, follow up.',
  'Every “no” gets you closer to a “yes”.',
  'Your next chapter starts with one click.',
  'Stay curious. Stay persistent. Stay you.',
  'Great careers are built one application at a time.',
  'You’ve got the skills. Now tell the story.',
  'Momentum matters. Keep it going today.',
  'Believe in your work. Recruiters will too.',
] as const;

export const randomMotivation = () => MOTIVATION[Math.floor(Math.random() * MOTIVATION.length)];
