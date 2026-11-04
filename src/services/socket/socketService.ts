import { appConfig } from '../../config'
import { MockSocketService } from './mockSocketService'
import { RealSocketService } from './realSocketService'
import type { ChatSocketService } from './socketTypes'

function createChatSocketService(): ChatSocketService {
  return appConfig.useMock ? new MockSocketService() : new RealSocketService()
}

export const chatSocket = createChatSocketService()
