// Shop customers (winkelbeheer fase 1): pure validation, normalisation and search helpers.
// No database access here, so everything is testable without external services.

export const customerTypes = { private: 'Particulier', business: 'Bedrijf' } as const;
export type CustomerType = keyof typeof customerTypes;

export const customerCountries = { BE: 'België', NL: 'Nederland', FR: 'Frankrijk', LU: 'Luxemburg', DE: 'Duitsland' } as const;

export type CustomerInput = {
  customer_type: CustomerType;
  first_name: string;
  last_name: string;
  company_name: string;
  vat_number: string | null;
  email: string | null;
  phone: string | null;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  country: string;
  preferred_shop_id: string | null;
  marketing_opt_in: boolean;
  note: string;
};

export type Customer = CustomerInput & {
  id: string;
  customer_number: string;
  marketing_opt_in_at: string | null;
  version: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
};

export const CUSTOMER_COLUMNS =
  'id,customer_number,customer_type,first_name,last_name,company_name,vat_number,email,phone,street,house_number,postal_code,city,country,preferred_shop_id,marketing_opt_in,marketing_opt_in_at,note,version,archived_at,created_at,updated_at,created_by,updated_by';

/** Error with a Dutch message for the user and the form field it belongs to. */
export class CustomerInputError extends Error {
  field: keyof CustomerInput | 'form';
  constructor(field: keyof CustomerInput | 'form', message: string) {
    super(message);
    this.field = field;
    this.name = 'CustomerInputError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

function text(form: FormData, key: keyof CustomerInput, max: number, label: string): string {
  const value = String(form.get(key) ?? '').replace(/\s+/g, ' ').trim();
  if (value.length > max) throw new CustomerInputError(key, `${label} mag maximaal ${max} tekens bevatten.`);
  return value;
}

export function normalizeEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  // Commas, parentheses and quotes are refused: they are not used in real addresses and have meaning in query filters.
  if (value.length > 254 || !/^[^@\s,()"'\\]+@[^@\s,()"'\\]+\.[^@\s,()"'\\]+$/.test(value)) {
    throw new CustomerInputError('email', 'Vul een geldig e-mailadres in.');
  }
  return value;
}

const DIAL_CODES: Record<string, string> = { BE: '32', NL: '31', FR: '33', LU: '352', DE: '49' };

/** Normalises to international format (+32470123456). Local numbers get the country's dial code. */
export function normalizePhone(raw: string, country: string): string | null {
  let value = raw.trim().replace(/[\s.\-/()]/g, '');
  if (!value) return null;
  if (value.startsWith('00')) value = '+' + value.slice(2);
  else if (value.startsWith('0') && DIAL_CODES[country]) value = '+' + DIAL_CODES[country] + value.slice(1);
  if (!/^\+?[0-9]{6,15}$/.test(value)) {
    throw new CustomerInputError('phone', 'Vul een geldig telefoonnummer in, bijvoorbeeld 0470 12 34 56.');
  }
  return value;
}

/** Belgian enterprise numbers: 10 digits, first digit 0 or 1, last two digits are a mod-97 check. */
export function isValidBelgianVat(vat: string): boolean {
  const match = /^BE([01][0-9]{9})$/.exec(vat);
  if (!match) return false;
  const digits = match[1];
  return 97 - (Number(digits.slice(0, 8)) % 97) === Number(digits.slice(8));
}

export function normalizeVat(raw: string, country: string): string | null {
  let value = raw.toUpperCase().replace(/[\s.\-]/g, '');
  if (!value) return null;
  if (/^[0-9]+$/.test(value)) {
    if (country !== 'BE') throw new CustomerInputError('vat_number', 'Vermeld het btw-nummer met landcode, bijvoorbeeld NL123456789B01.');
    value = 'BE' + value.padStart(10, '0');
  }
  if (value.startsWith('BE')) {
    if (value.length === 11) value = 'BE0' + value.slice(2);
    if (!isValidBelgianVat(value)) throw new CustomerInputError('vat_number', 'Dit Belgische btw-nummer is ongeldig. Controleer de cijfers.');
    return value;
  }
  if (!/^[A-Z]{2}[0-9A-Z]{2,13}$/.test(value)) throw new CustomerInputError('vat_number', 'Vul een geldig btw-nummer in met landcode.');
  return value;
}

function normalizePostalCode(raw: string, country: string): string {
  const value = raw.toUpperCase().replace(/\s+/g, '');
  if (!value) return '';
  if (['BE', 'LU'].includes(country) && !/^[0-9]{4}$/.test(value)) throw new CustomerInputError('postal_code', 'Een postcode in ' + (country === 'BE' ? 'België' : 'Luxemburg') + ' bestaat uit 4 cijfers.');
  if (country === 'NL' && !/^[0-9]{4}[A-Z]{2}$/.test(value)) throw new CustomerInputError('postal_code', 'Een Nederlandse postcode heeft de vorm 1234AB.');
  if (value.length > 12) throw new CustomerInputError('postal_code', 'Postcode is te lang.');
  return country === 'NL' ? value.slice(0, 4) + ' ' + value.slice(4) : value;
}

/** Parses and validates customer form data. Throws CustomerInputError with a Dutch message. */
export function customerInput(form: FormData): CustomerInput {
  const type = String(form.get('customer_type') ?? 'private');
  if (!Object.hasOwn(customerTypes, type)) throw new CustomerInputError('customer_type', 'Kies particulier of bedrijf.');
  const customer_type = type as CustomerType;
  const country = String(form.get('country') ?? 'BE').trim().toUpperCase() || 'BE';
  if (!/^[A-Z]{2}$/.test(country)) throw new CustomerInputError('country', 'Kies een geldig land.');

  const first_name = text(form, 'first_name', 80, 'Voornaam');
  const last_name = text(form, 'last_name', 80, 'Achternaam');
  const company_name = text(form, 'company_name', 160, 'Bedrijfsnaam');
  if (customer_type === 'private' && !first_name && !last_name) throw new CustomerInputError('last_name', 'Vul minstens een voor- of achternaam in.');
  if (customer_type === 'business' && !company_name) throw new CustomerInputError('company_name', 'Een bedrijfsnaam is verplicht voor een bedrijfsklant.');

  const email = normalizeEmail(String(form.get('email') ?? ''));
  const phone = normalizePhone(String(form.get('phone') ?? ''), country);
  if (!email && !phone) throw new CustomerInputError('email', 'Vul een e-mailadres of telefoonnummer in, zodat we de klant kunnen bereiken.');

  const vat_number = customer_type === 'business' ? normalizeVat(String(form.get('vat_number') ?? ''), country) : null;

  const shop = String(form.get('preferred_shop_id') ?? '').trim();
  if (shop && !isUuid(shop)) throw new CustomerInputError('preferred_shop_id', 'Kies een bestaande winkel.');

  const note = String(form.get('note') ?? '').trim();
  if (note.length > 4000) throw new CustomerInputError('note', 'Notitie mag maximaal 4000 tekens bevatten.');

  return {
    customer_type,
    first_name,
    last_name,
    company_name,
    vat_number,
    email,
    phone,
    street: text(form, 'street', 160, 'Straat'),
    house_number: text(form, 'house_number', 20, 'Huisnummer'),
    postal_code: normalizePostalCode(String(form.get('postal_code') ?? ''), country),
    city: text(form, 'city', 80, 'Gemeente'),
    country,
    preferred_shop_id: shop || null,
    marketing_opt_in: form.get('marketing_opt_in') === 'on',
    note,
  };
}

/**
 * Safe search term for PostgREST `or(...ilike...)` filters.
 * Strips characters with a meaning in filter syntax or LIKE patterns, so input cannot widen the query.
 */
export function customerSearchTerm(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.replace(/[%_,()*\\:"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return value.length >= 2 ? value : null;
}

/** Builds the PostgREST `or` filter for a search term (already sanitised by customerSearchTerm). */
export function customerSearchFilter(term: string): string {
  const parts = ['customer_number', 'first_name', 'last_name', 'company_name', 'email', 'city', 'vat_number'].map(c => `${c}.ilike.%${term}%`);
  const digits = term.replace(/[^0-9]/g, '');
  if (digits.length >= 4) parts.push(`phone.ilike.%${digits.replace(/^0+/, '')}%`);
  return parts.join(',');
}

export function customerDisplayName(c: Pick<CustomerInput, 'customer_type' | 'first_name' | 'last_name' | 'company_name'>): string {
  const person = [c.first_name, c.last_name].filter(Boolean).join(' ');
  if (c.customer_type === 'business') return person ? `${c.company_name} (${person})` : c.company_name;
  return person;
}

export function formatPhone(phone: string | null): string {
  if (!phone) return '';
  const be = /^\+32(4[0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})$/.exec(phone);
  return be ? `+32 ${be[1]} ${be[2]} ${be[3]} ${be[4]}` : phone;
}

export const customerEventLabels: Record<string, string> = {
  created: 'Klant aangemaakt',
  updated: 'Gegevens gewijzigd',
  archived: 'Gearchiveerd',
  restored: 'Teruggezet',
  lead_linked: 'Buyback-lead gekoppeld',
};

export const customerFieldLabels: Record<string, string> = {
  customer_type: 'type', first_name: 'voornaam', last_name: 'achternaam', company_name: 'bedrijfsnaam', vat_number: 'btw-nummer',
  email: 'e-mail', phone: 'telefoon', street: 'straat', house_number: 'huisnummer', postal_code: 'postcode', city: 'gemeente',
  country: 'land', preferred_shop_id: 'voorkeurwinkel', marketing_opt_in: 'marketingtoestemming', marketing_opt_in_at: 'marketingtoestemming', note: 'notitie',
};
