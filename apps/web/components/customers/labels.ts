export const TYPE_LABEL = { DOCTOR: 'Doctor', HOSPITAL: 'Hospital', CLINIC: 'Clinic' } as const;
export type CustomerType = keyof typeof TYPE_LABEL;
