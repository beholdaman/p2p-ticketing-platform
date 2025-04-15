import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import { algorandFixture} from '@algorandfoundation/algokit-utils/testing';
import { Config, microAlgos } from '@algorandfoundation/algokit-utils';
import { TicketingPlatformClient, TicketingPlatformFactory, TicketingPlatformParamsFactory } from '../contracts/clients/TicketingPlatformClient';
import algokit from '@algorandfoundation/algokit-utils';
import testing from '@algorandfoundation/algokit-utils';
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount';
import algosdk from 'algosdk';

const fixture = algorandFixture();
Config.configure({ populateAppCallResources: true });

const listingMbr = 2_500 + (4_00 * 48);
const assetPrice1 = 3.5 * 1_000_000;
const assetPrice2 = 2.3 * 1_000_000;

let appClient: TicketingPlatformClient;

const algod = algokit.getAlgoClient();

const indexer = new algosdk.Indexer('', 'https://localnet-idx.algonode.cloud', '');


describe('TicketingPlatform', () => {
  beforeEach(fixture.beforeEach);

  let testAssetsId: [uint64 | bigint, uint64 |bigint];

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

    await algorand.account.fromEnvironment(
      'stableSeller2', microAlgos(100* 1_000_000)
   );
   const stableSeller2 = await algorand.account.fromKmd('stableSeller2');

    testAssetsId = await Promise.all([
      (
        await algorand.send.assetCreate({
          sender: stableSeller.addr,
          total: BigInt(1),
          decimals: 0,
        })
      ).confirmation.assetIndex!,
      (
        await algorand.send.assetCreate({
          sender: stableSeller.addr,
          total: BigInt(1),
          decimals: 0,
        })
      ).confirmation.assetIndex!,
    ]);


    const factory = new TicketingPlatformFactory({
      algorand,
      defaultSender: testAccount.addr,
    });

    const createResult = await factory.send.create.createApplication();
    appClient = createResult.appClient;

    await appClient.createTransaction.fundAppAccount({
      amount: microAlgos(10 * 10_000_000)
    });

  });


  //test newListing su asset in cui non si e' fatto opt-in
  test('newListingNewAsset', async () => {
    const { algorand } = fixture;
    const stableSeller = await algorand.account.fromKmd('stableSeller');
    const { appAddress } = await appClient.appClient.getAppAddress();

    //chiamata al metodo
    //creo un listing per 1 asset 
    //pago solo il prezzo per listing
    const results = await Promise.all(
      testAssetsId.map(async (asset) =>
        appClient.appClient.newListing(
          {
            mbrPay: await algorand.createTransaction.payment({
              sender: stableSeller.addr,
              receiver: appAddress,
              amount: microAlgos(listingMbr+globals.assetOptInMinBalance), //testo anche il resto
            }),
            xfer: await algorand.createTransaction.assetTransfer({
              assetId: BigInt(asset),
              sender: stableSeller.addr,
              receiver: appAddress,
              amount: BigInt(1),
            }),
            unitaryPrice: microAlgos(1_000_000),
          },
          { sender: stableSeller }
        )
      )
    );

    results.map((result: any) => expect(result.confirmation).toBeDefined());

    //controllo sugli asset posseduti
    await Promise.all(
      testAssetsId.map(async (asset) => {
        await expect(algorand.asset.getAccountInformation(appAddress, BigInt(asset))).resolves.toEqual(
          expect.objectContaining({
            assetId: BigInt(asset),
            balance: BigInt(0),
          })
        );
      })
    );

    //controllo su bilancio account
    await expect(algorand.account.getInformation('stableSeller')).resolves.toEqual(
      expect.objectContaining({
        balance: microAlgos((100* 1_000_000) - listingMbr+globals.assetOptInMinBalance),
      })
    );
  

    //controllo sul contenuto del listing
    await Promise.all(
      testAssetsId.map(async (asset) => {
        const boxContent = await appClient.getBoxValue(
            algosdk.encodeUint64(asset)
        );
        const boxOwner = algosdk.decodeUint64(boxContent.slice(0, 32), 'safe');
        const boxUnitaryPrice = algosdk.decodeUint64(boxContent.slice(32, 40), 'safe');
        expect(boxOwner).toEqual(stableSeller.addr);
        expect(boxUnitaryPrice).toEqual(microAlgos(1_000_000));
      })
    );
  });

  test('newListingOldAsset', async () => {
    const { algorand } = fixture;
    const stableSeller2 = await algorand.account.fromKmd('stableSeller2');
    const { appAddress } = await appClient.appClient.getAppReference();

    let accountBalance = (await algorand.account.getInformation('stableSeller')).balance.valueOf

    //chiamata al metodo
    //creo un listing per 1 asset 
    //pago solo il prezzo per listing
    const results = await Promise.all(
      testAssetsId.map(async (asset) =>
        appClient.newListing(
          {
            mbrPay: await algorand.createTransaction.payment({
              sender: stableSeller2.addr,
              receiver: appAddress,
              amount: microAlgos(listingMbr),
            }),
            xfer: await algorand.createTransaction.assetTransfer({
              assetId: BigInt(asset),
              sender: stableSeller2.addr,
              receiver: appAddress,
              amount: BigInt(1),
            }),
            unitaryPrice: microAlgos(1_000_000),
          },
          { sender: stableSeller2 }
        )
      )
    );

    results.map((result: any) => expect(result.confirmation).toBeDefined());

    //controllo sugli asset posseduti
    await Promise.all(
      testAssetsId.map(async (asset) => {
        await expect(algorand.asset.getAccountInformation(appAddress, BigInt(asset))).resolves.toEqual(
          expect.objectContaining({
            assetId: BigInt(asset),
            balance: BigInt(0),
          })
        );
      })
    );


    //controllo su bilancio account
    await expect(algorand.account.getInformation('stableSeller2')).resolves.toEqual(
      expect.objectContaining({
        balance: accountBalance() - listingMbr,
      })
    );
  

    //controllo sul contenuto del listing
    await Promise.all(
      testAssetsId.map(async (asset) => {
        const boxContent = await appClient.getBoxValue(
            algosdk.encodeUint64(asset)
        );
        const boxOwner = algosdk.decodeUint64(boxContent.slice(0, 32), 'safe');
        const boxUnitaryPrice = algosdk.decodeUint64(boxContent.slice(32, 40), 'safe');
        expect(boxOwner).toEqual(stableSeller2.addr);
        expect(boxUnitaryPrice).toEqual(microAlgos(1_000_000));
      })
    );
  });

  test('setPrice', async () => {
    const { algorand } = fixture;
    const stableSeller = await algorand.account.fromKmd('stableSeller');

    //cambio prezzo
    const results = await Promise.all(
      [
        [testAssetsId[0], microAlgos(3.2 * 1_000_000)],
        [testAssetsId[1], microAlgos(5.7 * 1_000_000)],
      ].map(async ([asset, unitaryPrice]) =>
        appClient.createTransaction.changePrice(
          {
            asset,
            unitaryPrice,
          },
          { sender: stableSeller }
        )
      )
    );

    results.map((result: any) => expect(result.confirmation).toBeDefined());

    //verifica nuovi prezzi
    await Promise.all(
      [
        [testAssetsId[0], microAlgos(3.2 * 1_000_000).microAlgos],
        [testAssetsId[1], microAlgos(5.7 * 1_000_000).microAlgos],
      ].map(async ([asset, unitaryPrice]) => {
        const boxContent = await appClient.getBoxValue(
          algosdk.encodeUint64(asset),
        );
        const boxUnitaryPrice = algosdk.decodeUint64(boxContent.slice(32, 40), 'safe');
        expect(boxUnitaryPrice).toEqual(unitaryPrice);
      })
    );
  });

  test('buy', async () => {
    const { algorand } = fixture;
    const stableSeller = await algorand.account.fromKmd('stableSeller');
    const buyer = await algorand.account.fromKmd('buyer');

    //opt-in all'asset da comprare
    await Promise.all(
      testAssetsId.map(async (asset) =>
        algorand.send.assetOptIn({
          assetId: BigInt(asset),
          sender: buyer.addr,
        })
      )
    );

    const results = await Promise.all(
      [
        [testAssetsId[0], 6.7936 * 1_000_000],
        [testAssetsId[1], 12.1011 * 1_000_000],
      ].map(async ([asset, amountToPay]) =>
        appClient.createTransaction.buy(
          {
            owner: stableSeller.addr,
            asset,
            nonce: 0,
            buyPay: await algorand.createTransaction.payment({
              sender: buyer.addr,
              receiver: stableSeller.addr,
              amount: microAlgos(Number(amountToPay)),
              extraFee: microAlgos(1_000),
            }),
            quantity: 1,
          },
          { sender: buyer }
        )
      )
    );

    results.map((result : any) => expect(result.confirmation).toBeDefined());

    await Promise.all(
      testAssetsId.map(async (asset) => {
        await expect(algorand.asset.getAccountInformation(buyer.addr, BigInt(asset))).resolves.toEqual(
          expect.objectContaining({
            assetId: BigInt(asset),
            balance: BigInt(1),
          })
        );
      })
    );

    let accountBalance = (await algorand.account.getInformation('stableSeller')).balance.valueOf

    //controllo bilancio
    await expect(algorand.account.getInformation('buyer')).resolves.toEqual(
    expect.objectContaining({
      balance: accountBalance() - assetPrice1 - assetPrice2,
    })
  );

  //controllo che i box non esistano piu' per gli asset venduti
  await Promise.all(
    testAssetsId.map(async (asset) => {
      expect(await appClient.getBoxValue(
        algosdk.encodeUint64(asset),
      )).toEqual(0);
    })
  );

  });

  test('withdraw', async () => {
    const { algorand } = fixture;
    const stableSeller = await algorand.account.fromKmd('stableSeller');

    const beforeCallAmount = (await algorand.account.getInformation(stableSeller.addr)).balance.valueOf;

    //ritira tutti gli asset
    const results = await Promise.all(
      testAssetsId.map(async (asset) =>
        appClient.createTransaction.withdraw(
          {
            asset,
          },
          { sender: stableSeller, sendParams: { fee: microAlgos(0.003 * 1_000_000) } }
        )
      )
    );

    results.map((result: any) => expect(result.confirmation).toBeDefined());

    const afterCallAmount = (await algorand.account.getInformation(stableSeller.addr)).balance.valueOf;
    expect(afterCallAmount() - beforeCallAmount()).toEqual(2 * (listingMbr - 3_000));
    //recupero di due mbr, pagamento di due fee di 3_000 per withdraw

    //riottiene gli asset
    await Promise.all(
      testAssetsId.map(async (asset) => {
        await expect(algorand.asset.getAccountInformation(stableSeller.addr, BigInt(asset))).resolves.toEqual(
          expect.objectContaining({
            assetId: BigInt(asset),
            balance: BigInt(1),
          })
        );
      })
    );
  });
});
