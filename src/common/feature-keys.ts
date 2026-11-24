/**
 * The sections of UniLib that usage is counted for. The app reports a key when someone opens a section, and the admin
 * panel lists the same keys with these names. Adding a section means adding a line here and one route in the app.
 */
export const FEATURES = [
  { key: 'home', label: 'Home' },
  { key: 'library', label: 'Study materials' },
  { key: 'search', label: 'Search' },
  { key: 'practice', label: 'Past question practice' },
  { key: 'flashcards', label: 'Flashcards' },
  { key: 'ai_tools', label: 'AI study tools' },
  { key: 'classroom', label: 'AI Classroom' },
  { key: 'study_plan', label: 'Study plan' },
  { key: 'chat', label: 'Chat' },
  { key: 'marketplace', label: 'Marketplace' },
  { key: 'novels', label: 'Novels' },
  { key: 'schools', label: 'University pages' },
  { key: 'premium', label: 'Premium' },
  { key: 'profile', label: 'Profile' },
  { key: 'settings', label: 'Settings' },
  { key: 'feedback', label: 'Feedback' },
] as const;

export type FeatureKey = (typeof FEATURES)[number]['key'];

const KEYS = new Set<string>(FEATURES.map((f) => f.key));
export const isFeatureKey = (value: unknown): value is FeatureKey => typeof value === 'string' && KEYS.has(value);
