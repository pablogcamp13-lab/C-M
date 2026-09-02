export interface CommercialPlan {
  id: string;
  name: string;
  type: 'FLASH' | 'ILIMITADO';
  fixedFee: number;
  bipayPayment: number;
  bipayReturn: number;
  isHighlight?: boolean;
}

export const COMMERCIAL_PLANS: CommercialPlan[] = [
  {
    id: 'plan_flash_2990',
    name: 'Plan Flash S/ 29.90',
    type: 'FLASH',
    fixedFee: 29.90,
    bipayPayment: 26.91,
    bipayReturn: 2.99
  },
  {
    id: 'plan_ilim_3990',
    name: 'Plan Ilimitado S/ 39.90',
    type: 'ILIMITADO',
    fixedFee: 39.90,
    bipayPayment: 27.93,
    bipayReturn: 11.97
  },
  {
    id: 'plan_ilim_4990',
    name: 'Plan Ilimitado S/ 49.90',
    type: 'ILIMITADO',
    fixedFee: 49.90,
    bipayPayment: 34.93,
    bipayReturn: 14.97
  },
  {
    id: 'plan_ilim_5590',
    name: 'Plan Ilimitado S/ 55.90',
    type: 'ILIMITADO',
    fixedFee: 55.90,
    bipayPayment: 39.13,
    bipayReturn: 16.77
  },
  {
    id: 'plan_ilim_6590',
    name: 'Plan Ilimitado S/ 65.90',
    type: 'ILIMITADO',
    fixedFee: 65.90,
    bipayPayment: 46.13,
    bipayReturn: 19.77,
    isHighlight: true
  },
  {
    id: 'plan_ilim_6990',
    name: 'Plan Ilimitado S/ 69.90',
    type: 'ILIMITADO',
    fixedFee: 69.90,
    bipayPayment: 48.93,
    bipayReturn: 20.97
  },
  {
    id: 'plan_ilim_7990',
    name: 'Plan Ilimitado S/ 79.90',
    type: 'ILIMITADO',
    fixedFee: 79.90,
    bipayPayment: 55.93,
    bipayReturn: 23.97
  },
  {
    id: 'plan_ilim_10590',
    name: 'Plan Ilimitado S/ 105.90',
    type: 'ILIMITADO',
    fixedFee: 105.90,
    bipayPayment: 74.13,
    bipayReturn: 31.77
  }
];
