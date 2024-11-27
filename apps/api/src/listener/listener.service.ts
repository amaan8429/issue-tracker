import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ethers } from 'ethers'
import {
  IssueTracker,
  IssueTracker__factory,
} from '../../../../standalone/issue-tracker-contract/typechain-types'
import { contractAddress } from 'src/common/utils'
import { PrismaService } from 'src/common/prisma/prisma.service'
import { IssueStatus } from '@prisma/client'

const statusMapping = [
  IssueStatus.REPORTED,
  IssueStatus.VERIFIED,
  IssueStatus.FIXED,
  IssueStatus.CLOSED,
]

@Injectable()
export class ListenerService implements OnModuleInit, OnModuleDestroy {
  private provider: ethers.WebSocketProvider
  private contract: IssueTracker

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    //   Initialize web socket provider
    this.initializeWebSocketProvider()
    // Setup the event subscriber
    this.subscribeToEvents()
  }

  onModuleDestroy() {
    this.cleanup()
  }

  initializeWebSocketProvider() {
    const infuraWssUrl = `wss://polygon-amoy.infura.io/ws/v3/${process.env.INFURA_KEY}`
    this.provider = new ethers.WebSocketProvider(infuraWssUrl)

    this.contract = IssueTracker__factory.connect(
      contractAddress,
      this.provider,
    )
  }

  subscribeToEvents() {
    if (!this.contract) {
      throw new Error('Contract is not initialized')
    }
    try {
      this.contract.on(
        this.contract.filters.OrganizationRegistered,
        async (id, name, description, contact, event) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const blockNumber = event.log.blockNumber
          const timestamp = await this.getBlockTimeStamp(blockNumber)

          await this.prisma.organization.create({
            data: {
              id,
              description,
              contact,
              name,
              timestamp,
            },
          })
        },
      )
      console.log('Event:  OrganizationRegistered Listening...')
    } catch (error) {
      console.error(
        'Event: OrganizationRegistered: Listener setup failed.',
        error,
      )
    }

    try {
      this.contract.on(
        this.contract.filters.ProjectCreated,
        async (projectId, name, organization, event) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const blockNumber = event.log.blockNumber
          const timestamp = await this.getBlockTimeStamp(blockNumber)

          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          await this.createProject({
            organization,
            name,
            projectId: projectId.toString(),
            timestamp,
          })
        },
      )
      console.log('Event: ProductCreated Listening...')
    } catch (error) {
      console.error('Event: ProductCreated: Listener setup failed.', error)
    }

    try {
      this.contract.on(
        this.contract.filters.IssuesAdded,
        async (issuesId, projectId, event) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const timestamp = await this.getBlockTimeStamp(event.log.blockNumber)

          const items = await this.createIssues({
            projectId: projectId.toString(),
            issuesId,
            timestamp,
          })

          console.log('items', items)
        },
      )
      console.log('Event: ProductItemsAdded Listening...')
    } catch (error) {
      console.error('Event: ProductItemsAdded: Listener setup failed.', error)
    }

    try {
      this.contract.on(
        this.contract.filters.IssueStatusChanged,
        async (issuesId, statusIndex, event) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const timestamp = await this.getBlockTimeStamp(event.log.blockNumber)

          await this.updateIssueStatus({
            issuesId,
            statusIndex: +statusIndex.toString(),
            timestamp,
          })
        },
      )
      console.log('Event: ProductItemsStatusChanged Listening...')
    } catch (error) {
      console.error(
        'Event: ProductItemsStatusChanged: Listener setup failed.',
        error,
      )
    }

    try {
      this.contract.on(
        this.contract.filters.StackAdded,
        async (projectId, name, version, event) => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const timestamp = await this.getBlockTimeStamp(event.log.blockNumber)

          await this.createstack({
            name,
            projectId: projectId.toString(),
            version: Number(version.toString()),
            timestamp,
          })
        },
      )
      console.log('Event: stackCreated Listening...')
    } catch (error) {
      console.error('Event: stackCreated: Listener setup failed.', error)
    }
  }

  async resyncBlockchainData() {
    if (!this.contract) {
      throw new Error('Contract is not initialized')
    }

    const fromBlock = 0
    const toBlock = 'latest'

    // 1. organizationRegistered events

    const organizationRegisteredEvents = await this.contract.queryFilter(
      this.contract.filters.OrganizationRegistered,
      fromBlock,
      toBlock,
    )

    for (const event of organizationRegisteredEvents) {
      const [id, name, description, contact] = event.args
      const timestamp = await this.getBlockTimeStamp(event.blockNumber)

      await this.createorganization({
        contact,
        id,
        description,
        name,
        timestamp,
      })
    }

    //   2. ProductCreated events

    const projectCreatedEvents = await this.contract.queryFilter(
      this.contract.filters.ProjectCreated,
      fromBlock,
      toBlock,
    )

    for (const event of projectCreatedEvents) {
      const [projectId, name, organization] = event.args
      const timestamp = await this.getBlockTimeStamp(event.blockNumber)

      await this.createProject({
        organization,
        name,
        projectId: projectId.toString(),
        timestamp,
      })
    }

    // Query and handle ProductItemsAdded events
    const IssuesAddedEvents = await this.contract.queryFilter(
      this.contract.filters.IssuesAdded,
      fromBlock,
      toBlock,
    )
    for (const event of IssuesAddedEvents) {
      const [issuesId, projectId] = event.args
      const timestamp = await this.getBlockTimeStamp(event.blockNumber)

      await this.createIssues({
        projectId: projectId.toString(),
        issuesId,
        timestamp,
      })
    }

    // Query and handle ProductItemsStatusChanged events
    const IssueStatusChangedEvents = await this.contract.queryFilter(
      this.contract.filters.IssueStatusChanged,
      fromBlock,
      toBlock,
    )

    for (const event of IssueStatusChangedEvents) {
      const [issuesId, statusIndex] = event.args
      const timestamp = await this.getBlockTimeStamp(event.blockNumber)

      await this.updateIssueStatus({
        issuesId,
        statusIndex: +statusIndex.toString(),
        timestamp,
      })
    }

    // Query and handle stackCreated events
    const stackCreatedEvents = await this.contract.queryFilter(
      this.contract.filters.StackAdded(),
      fromBlock,
      toBlock,
    )
    for (const event of stackCreatedEvents) {
      const [projectId, name, version] = event.args
      const timestamp = await this.getBlockTimeStamp(event.blockNumber)

      await this.createstack({
        name,
        projectId: projectId.toString(),
        version: +version.toString(),
        timestamp,
      })
    }
  }

  cleanup() {
    this.provider.removeAllListeners()
  }

  // utils
  async getBlockTimeStamp(blockNumber: number) {
    const block = await this.provider.getBlock(blockNumber)
    return new Date(block.timestamp * 1000)
  }

  /**
   * DB Writes
   */

  private async createorganization({
    id,
    name,
    description,
    contact,
    timestamp,
  }: {
    id: string
    name: string
    description: string
    contact: string
    timestamp: Date
  }) {
    const organization = await this.prisma.organization.create({
      data: {
        id,
        description,
        contact,
        name,
        timestamp,
      },
    })
    console.log('organization created: ', organization)
  }

  private async createProject({
    organization,
    name,
    projectId,
    timestamp,
  }: {
    organization: string
    name: string
    projectId: string
    timestamp: Date
  }) {
    const project = await this.prisma.project.create({
      data: {
        id: projectId,
        name,
        timestamp,
        organization: {
          connect: {
            id: organization,
          },
        },
      },
    })
    console.log('Product created: ', project)
  }

  private createIssues({
    projectId,
    issuesId,
    timestamp,
  }: {
    issuesId: string[]
    projectId: string
    timestamp: Date
  }) {
    const transactions = issuesId.map((issueId) => {
      return this.prisma.transaction.create({
        data: {
          status: IssueStatus.REPORTED,
          issueId,
          timestamp,
        },
      })
    })
    const issueUpdates = this.prisma.issue.createMany({
      data: issuesId.map((id) => ({
        id,
        projectId: projectId.toString(),
        status: IssueStatus.REPORTED,
        timestamp,
      })),
    })
    return this.prisma.$transaction([issueUpdates, ...transactions])
  }

  private updateIssueStatus({
    statusIndex,
    issuesId,
    timestamp,
  }: {
    statusIndex: number
    issuesId: string[]
    timestamp: Date
  }) {
    const status = statusMapping[+statusIndex.toString()] as IssueStatus

    const transactions = issuesId.map((issueId) => {
      return this.prisma.transaction.create({
        data: {
          status,
          issueId,
          timestamp,
        },
      })
    })

    const issueUpdates = this.prisma.issue.updateMany({
      data: { status, timestamp },
      where: { id: { in: issuesId } },
    })

    return this.prisma.$transaction([issueUpdates, ...transactions])
  }

  private async createstack({
    projectId,
    name,
    version,
    timestamp,
  }: {
    projectId: string
    name: string
    version: number
    timestamp: Date
  }) {
    const maxRetries = 5
    let retryCount = 0
    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms))

    while (retryCount < maxRetries) {
      const project = await this.prisma.project.findUnique({
        where: {
          id: projectId,
        },
      })

      if (project) {
        const stack = await this.prisma.stack.create({
          data: {
            name,
            version,
            projectId,
            timestamp,
          },
        })
        console.log('Toxic item created: ', stack)
        return
      } else {
        console.error(
          `Product with ID ${projectId} not found. Retrying (${retryCount + 1}/${maxRetries})...`,
        )
        await delay(1000) // Wait for 1 second before retrying
        retryCount++
      }
    }
  }
}
