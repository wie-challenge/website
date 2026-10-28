import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {signedTnd,cashGap,csvCell,paymentTimeliness} from '../../../../../apps/api/src/modules/finance/analysis.js';
const rows=[];
assert.equal(signedTnd(100001n-120003n),'-20.002');rows.push({case:'Negative contribution/variance exact sign',result:'PASS',value:'-20.002'});
const cash=cashGap([{id:'purchase',direction:'OUT',amount:120003n,date:'2026-10-01T00:00:00Z',evidence:'PROJECTED'},{id:'partial-receipt',direction:'IN',amount:50000n,date:'2026-10-02T00:00:00Z',evidence:'PROJECTED'},{id:'late-receipt',direction:'IN',amount:50001n,date:'2026-10-31T00:00:00Z',evidence:'PROJECTED'}]);assert.equal(cash.minimumModeledGapTnd,'120.003');assert.equal(cash.timeline.at(-1)?.balanceTnd,'-20.002');rows.push({case:'Late and partial buyer inflows do not reduce earlier required cash',result:'PASS',value:cash.minimumModeledGapTnd});
for(const v of ['=SUM(A1:A2)','\t=HYPERLINK("evil")',' +cmd','-cmd','@cmd','\r=cmd'])assert.equal(csvCell(v).charCodeAt(1),39);rows.push({case:'Formula/control-character CSV neutralization',result:'PASS'});
const none=paymentTimeliness([],'2026-10-01','2026-11-01');assert.equal(none.onTimePercentage,null);rows.push({case:'Zero denominator is unavailable',result:'PASS'});
writeFileSync(new URL('./pure-finance.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');console.log('Independent pure financial checks: 4 PASS');
