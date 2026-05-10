import NetInfo from '@react-native-community/netinfo'
import { useEffect } from 'react'
import { flushOfflineQueue } from '@/lib/sync-engine'

/** When connection returns, push pending captures to the API. */
export function useAutoSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const unsub = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void flushOfflineQueue()
      }
    })
    return () => unsub()
  }, [enabled])
}
