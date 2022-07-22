const { getWeth, AMOUNT } = require("../scripts/getWeth")
const { getNamedAccounts, ethers } = require("hardhat")

async function main() {
  //protocol treats everything as an ERC20 token
  await getWeth()
  const { deployer } = await getNamedAccounts()

  //abi, address
  //Lending pool address provider: 0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5
  //lending pool:  ^
  const lendingPool = await getLendingPool(deployer)
  console.log(`LendingPool address ${lendingPool.address}`)

  // desposit!
  const wethTokenAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"

  // FIRST approve
  await approveErc20(wethTokenAddress, lendingPool.address, AMOUNT, deployer)

  console.log("Depositing...")
  // (address asset, uint256 amount, address onBehalfOf, uint16 referralCode)
  // SECOND deposit
  await lendingPool.deposit(wethTokenAddress, AMOUNT, deployer, 0)
  console.log("Deposited!")
  let { availableBorrowsETH, totalDebtETH } = await getBorrowUserData(
    lendingPool,
    deployer
  )
  // THIRD get dia price
  const daiPrice = await getDaiPrice()
  const amountDaiToBorrow =
    // .95 to avoid 100% available to borrow
    availableBorrowsETH.toString() * 0.95 * (1 / daiPrice.toNumber())
  console.log(`You can borrow ${amountDaiToBorrow} DAI`)
  const amountDaiToBorrowWei = ethers.utils.parseEther(
    amountDaiToBorrow.toString()
  )
  console.log(`You can borrow ${amountDaiToBorrowWei} WEI`)

  const daiTokenAddress = "0x6B175474E89094C44Da98b954EedeAC495271d0F"

  // FORTH borrow dia based on hm collateral we put down
  await borrowDai(daiTokenAddress, lendingPool, amountDaiToBorrowWei, deployer)
  await getBorrowUserData(lendingPool, deployer)
  // FINALLY repay
  await repay(amountDaiToBorrowWei, daiTokenAddress, lendingPool, deployer)
  await getBorrowUserData(lendingPool, deployer)
}

async function repay(amount, daiAddress, lendingPool, account) {
  await approveErc20(daiAddress, lendingPool.address, amount, account)
  // repay(address asset, uint256 amount, uint256 rateMode, address onBehalfOf)
  const repayTx = await lendingPool.repay(daiAddress, amount, 1, account)
  await repayTx.wait(1)
  console.log("Repaid Loan!")
}

async function borrowDai(
  daiAddress,
  lendingPool,
  amountDaiToBorrowWei,
  account
) {
  // borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)
  const borrowTx = await lendingPool.borrow(
    daiAddress,
    amountDaiToBorrowWei,
    1,
    0,
    account
  )
  await borrowTx.wait(1)
  console.log("You've borrowed DAI!")
}

async function getDaiPrice() {
  const daiEthPriceFeed = await ethers.getContractAt(
    "AggregatorV3Interface",
    "0x773616E4d11A78F511299002da57A0a94577F1f4" //DAI/ETH data feed contract address
    // Only reading so we dont need a signer/address/deployer
  )
  const price = (await daiEthPriceFeed.latestRoundData())[1]
  console.log(`DAI/ETH Price: ${price.toString()}`)
  return price
}

async function getBorrowUserData(lendingPool, account) {
  const { totalCollateralETH, totalDebtETH, availableBorrowsETH } =
    await lendingPool.getUserAccountData(account)
  console.log(
    `You have ${ethers.utils.formatEther(
      totalCollateralETH
    )} worth of ETH deposited`
  )
  console.log(
    `You have ${ethers.utils.formatEther(totalDebtETH)} worth of ETH borrowed`
  )
  console.log(
    `You can borrow ${ethers.utils.formatEther(
      availableBorrowsETH
    )} worth of ETH`
  )
  return { availableBorrowsETH, totalDebtETH }
}

async function getLendingPool(account) {
  // call contract to get address
  const lendingPoolAddressProvider = await ethers.getContractAt(
    "ILendingPoolAddressesProvider",
    "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5",
    account
  )
  // extract address
  const lendingPoolAddress = await lendingPoolAddressProvider.getLendingPool()
  // aaveLendingPool = abi, extracted address, account(deployer)
  const lendingPool = await ethers.getContractAt(
    "ILendingPool",
    lendingPoolAddress,
    account
  )
  return lendingPool // contract
}

async function approveErc20(
  ERC20Address,
  SpenderAddress,
  AmountToSpend,
  account
) {
  const erc20Token = await ethers.getContractAt("IERC20", ERC20Address, account)

  const tx = await erc20Token.approve(SpenderAddress, AmountToSpend)
  await tx.wait(1)
  console.log("Approved!")
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
