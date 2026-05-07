/**
 * Spec 026 — connected-account status card. Server Component.
 */
import type { WhatsappAccountSummary } from '@automatebro/shared/handlers/whatsappAccounts/listWhatsappAccounts';
import { DisconnectButton } from './disconnect-button';

const TIER_LABEL: Record<NonNullable<WhatsappAccountSummary['messagingTier']>, string> = {
  tier1: 'Tier 1 (1K conv/24h)',
  tier2: 'Tier 2 (10K conv/24h)',
  tier3: 'Tier 3 (100K conv/24h)',
  tier4: 'Tier 4 (Unlimited)',
};

const QUALITY_DOT: Record<NonNullable<WhatsappAccountSummary['qualityRating']>, string> = {
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  unknown: 'bg-gray-400',
};

export function AccountStatusCard({ account }: { account: WhatsappAccountSummary }) {
  const isDisconnected = account.disconnectedAt !== null;
  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm" data-testid="whatsapp-account-status">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span
              className={`h-2 w-2 rounded-full ${isDisconnected ? 'bg-gray-400' : 'bg-green-500'}`}
            />
            <span>{isDisconnected ? 'Disconnected' : 'Connected'}</span>
          </div>
          <div className="mt-1 text-xl font-semibold">{account.displayPhoneNumber}</div>
          {account.verifiedName !== null && (
            <div className="text-sm text-gray-700">{account.verifiedName}</div>
          )}
        </div>

        {!isDisconnected && <DisconnectButton accountId={account._id} />}
      </div>

      {!isDisconnected && (
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Tier</div>
            <div className="font-medium">
              {account.messagingTier !== null && account.messagingTier !== undefined
                ? TIER_LABEL[account.messagingTier]
                : 'Tier 1'}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Quality</div>
            <div className="flex items-center gap-2 font-medium">
              <span
                className={`h-2 w-2 rounded-full ${
                  account.qualityRating !== null && account.qualityRating !== undefined
                    ? QUALITY_DOT[account.qualityRating]
                    : 'bg-gray-400'
                }`}
              />
              {account.qualityRating !== null && account.qualityRating !== undefined
                ? `${account.qualityRating[0]?.toUpperCase()}${account.qualityRating.slice(1)}`
                : 'Unknown'}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Daily cap</div>
            <div className="font-medium">{account.dailyConversationCap} conversations</div>
          </div>
          <div>
            <div className="text-gray-500">Connected</div>
            <div className="font-medium">{account.connectedAt.toLocaleDateString()}</div>
          </div>
        </div>
      )}
    </div>
  );
}
