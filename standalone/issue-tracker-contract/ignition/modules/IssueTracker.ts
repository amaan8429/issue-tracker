// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from '@nomicfoundation/hardhat-ignition/modules'

const JAN_1ST_2030 = 1893456000
const ONE_GWEI: bigint = 1_000_000_000n

const IssueTrackerModule = buildModule('IssueTrackerModule', (m) => {
  const issueTracker = m.contract('IssueTracker', [])

  return { issueTracker }
})

export default IssueTrackerModule