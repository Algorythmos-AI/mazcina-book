import { redirect } from 'next/navigation';
import { primarySite } from '@/lib/gift-cards/site';

/** Customers buy gift cards on the public website; anyone landing here is sent there. */
export default function GiftCardsRedirect() {
  redirect(`${primarySite()}/gift-cards`);
}
