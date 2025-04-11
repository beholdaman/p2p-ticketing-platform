import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import { algorandFixture} from '@algorandfoundation/algokit-utils/testing';
import { Config, microAlgos } from '@algorandfoundation/algokit-utils';
import { TicketingPlatformClient, TicketingPlatformFactory } from '../contracts/clients/TicketingPlatformClient';
import algokit from '@algorandfoundation/algokit-utils';
import testing from '@algorandfoundation/algokit-utils';
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount';

const fixture = algorandFixture();
Config.configure({ populateAppCallResources: true });

let appClient: TicketingPlatformClient;

const algod = algokit.getAlgoClient();

describe('TicketingPlatform', () => {
  beforeEach(fixture.beforeEach);

  let testAssetsId: [number | bigint, number | bigint];

  beforeAll(async () => {
    await fixture.beforeEach();
    const { testAccount } = fixture.context;
    const { algorand } = fixture;

    await algorand.account.fromEnvironment(
      'buyer', microAlgos(100 * 1_000_000)
   );
    
    await algorand.account.fromEnvironment(
       'stableSeller', microAlgos(100* 1_000_000)
    );
    const stableSeller = await algorand.account.fromKmd('stableSeller');

    testAssetsId = await Promise.all([
      (
        await algorand.send.assetCreate({
          sender: stableSeller.addr,
          total: BigInt(10_000),
          decimals: 3,
        })
      ).confirmation.assetIndex!,
      (
        await algorand.send.assetCreate({
          sender: stableSeller.addr,
          total: BigInt(10_000),
          decimals: 3,
        })
      ).confirmation.assetIndex!,
    ]);


    const factory = new TicketingPlatformFactory({
      algorand,
      defaultSender: testAccount.addr,
    });

    const createResult = await factory.send.create.createApplication();
    appClient = createResult.appClient;

    await appClient.appClient.fundAppAccount(microAlgos(10 * 10_000_000));
  });

  
});
