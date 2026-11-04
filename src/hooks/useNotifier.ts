import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const soundStorageKey = 'acessanet-atendimento:sound-enabled'

export function useNotifier() {
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return window.localStorage.getItem(soundStorageKey) !== 'false'
  })
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    return 'Notification' in window ? Notification.permission : 'denied'
  })
  const audioContextRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    window.localStorage.setItem(soundStorageKey, String(soundEnabled))
  }, [soundEnabled])

  const toggleSound = useCallback(() => {
    setSoundEnabled((enabled) => !enabled)
  }, [])

  const requestNotificationPermission = useCallback(async () => {
    if (!('Notification' in window)) return

    const nextPermission = await Notification.requestPermission()
    setPermission(nextPermission)
  }, [])

  const playMessageSound = useCallback(() => {
    if (!soundEnabled) return

    const context = audioContextRef.current ?? new AudioContext()
    audioContextRef.current = context

    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.value = 0.045
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.12)
  }, [soundEnabled])

  const showNotification = useCallback(
    (title: string, body: string, onClick?: () => void) => {
      if (!('Notification' in window) || permission !== 'granted') return

      const notification = new Notification(title, {
        body,
        tag: 'acessanet-atendimento',
        silent: true,
      })

      notification.onclick = () => {
        window.focus()
        onClick?.()
        notification.close()
      }
    },
    [permission],
  )

  return useMemo(
    () => ({
      soundEnabled,
      notificationPermission: permission,
      toggleSound,
      requestNotificationPermission,
      playMessageSound,
      showNotification,
    }),
    [
      permission,
      playMessageSound,
      requestNotificationPermission,
      showNotification,
      soundEnabled,
      toggleSound,
    ],
  )
}
