import { convertLeadToClientAction, revertClientToLeadAction } from './leadConversion';
import type { Lead } from './types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`[PASS] ${message}`);
}

async function runLeadConversionTests() {
  console.log('=== RUNNING LEAD TO CLIENT CONVERSION & SAFE REVERSION AUTOMATED VERIFICATION ===');

  const sampleLead: Lead = {
    id: 'lead_test_001',
    workspace_id: 'ws_test_123',
    lead_number: 'LEAD-1001',
    contact_name: 'Vikram Sharma',
    company_name: 'Vikram Tech Solutions',
    email: 'vikram@example.com',
    phone: '9876543210',
    status: 'new',
    source: 'website',
    interested_service_name: 'Custom CRM Development',
    requirement: 'Need enterprise CRM with custom field engine',
    priority: 'high',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Test 1: Successful conversion
  const res1 = await convertLeadToClientAction('ws_test_123', sampleLead, 'user_owner_1');
  assert(res1.success === true, 'convertLeadToClientAction returns success = true');
  assert(!!res1.client, 'Client object returned on conversion');
  assert(res1.client?.contact_person === 'Vikram Sharma', 'contact_person transferred from lead contact_name');
  assert(res1.client?.business_name === 'Vikram Tech Solutions', 'business_name transferred from lead company_name');
  assert(res1.client?.primary_email === 'vikram@example.com', 'primary_email transferred from lead email');
  assert(res1.client?.primary_phone === '9876543210', 'primary_phone transferred from lead phone');

  // Test 2: Duplicate protection
  const convertedLead: Lead = {
    ...sampleLead,
    status: 'won',
    converted_client_id: res1.client?.id,
  };

  const res2 = await convertLeadToClientAction('ws_test_123', convertedLead, 'user_owner_1');
  assert(res2.success === false, 'Duplicate conversion prevented when converted_client_id exists');
  assert(res2.message === 'This lead has already been converted to a client.', 'Returns exact duplicate prevention message');

  // Test 3: Revert to Lead
  const revertRes = await revertClientToLeadAction('ws_test_123', convertedLead, 'user_owner_1');
  assert(revertRes.success === true, 'revertClientToLeadAction returns success = true when no dependent records exist');
  assert(revertRes.message === 'Client successfully reverted to Lead.', 'Returns exact success message on revert');
  assert(revertRes.updatedLead?.converted_client_id === undefined, 'converted_client_id cleared on reverted Lead');

  // Test 4: Re-conversion after revert works cleanly without duplicate errors
  const res3 = await convertLeadToClientAction('ws_test_123', revertRes.updatedLead!, 'user_owner_1');
  assert(res3.success === true, 'Re-converting reverted Lead succeeds cleanly');
  assert(!!res3.client?.id, 'Generates new Client ID on re-conversion');

  console.log('=== LEAD TO CLIENT CONVERSION TEST VERIFICATION COMPLETE: ALL PASSED ===');
}

runLeadConversionTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
