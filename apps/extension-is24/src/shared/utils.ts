import { SEEN_LISTINGS_CAP } from './constants';

export function generatePersonalizedMessage(
  template: string,
  landlordTitle: string | null,
  landlordName: string | null,
  isTenantNetwork = false,
): string {
  let message = template || '';

  const hasValidTitle = landlordTitle === 'Frau' || landlordTitle === 'Herr';

  if (message.includes('{name}')) {
    let nameReplacement: string;
    if (isTenantNetwork && landlordName) {
      nameReplacement = landlordName;
    } else if (hasValidTitle && landlordName) {
      nameReplacement = `${landlordTitle} ${landlordName}`;
    } else {
      nameReplacement = 'Damen und Herren';
    }
    message = message.replace(/{name}/g, nameReplacement);
  }

  if (!template.includes('{name}')) {
    let greeting: string;
    if (isTenantNetwork && landlordName) {
      greeting = `Hallo ${landlordName},`;
    } else if (landlordTitle === 'Frau' && landlordName) {
      greeting = `Sehr geehrte Frau ${landlordName},`;
    } else if (landlordTitle === 'Herr' && landlordName) {
      greeting = `Sehr geehrter Herr ${landlordName},`;
    } else {
      greeting = 'Sehr geehrte Damen und Herren,';
    }

    const hasGreeting = /^(Sehr\s+geehrte|Liebe|Hallo|Guten\s+Tag)/i.test(message.trim());
    if (!hasGreeting) {
      message = `${greeting}\n\n${message}`;
    }
  }

  return message;
}

export function capSeenListings(seenList: string[]): string[] {
  if (seenList.length > SEEN_LISTINGS_CAP) {
    return seenList.slice(seenList.length - SEEN_LISTINGS_CAP);
  }
  return seenList;
}
