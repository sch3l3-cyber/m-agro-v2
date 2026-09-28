import { z } from 'zod';

// 03_SIGURNOST.md: min 8 znakova, barem jedno slovo i jedan broj
export const LozinkaSchema = z
  .string()
  .min(8, 'Lozinka mora imati barem 8 znakova')
  .max(72, 'Lozinka smije imati najviše 72 znaka')
  .regex(/\p{L}/u, 'Lozinka mora sadržavati barem jedno slovo')
  .regex(/\d/, 'Lozinka mora sadržavati barem jedan broj');

export const EmailSchema = z.string().trim().toLowerCase().pipe(z.email('Neispravna email adresa').max(254));

export const PrijavaSchema = z.object({ email: EmailSchema, lozinka: z.string().min(1, 'Unesi lozinku') });
export const RegistracijaSchema = z.object({ email: EmailSchema, lozinka: LozinkaSchema });
export const ResetZahtjevSchema = z.object({ email: EmailSchema });
export const NovaLozinkaSchema = z.object({ lozinka: LozinkaSchema });
