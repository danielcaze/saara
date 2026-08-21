import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useImportWorkflow } from './hooks/useImportWorkflow'
import { HomeScreen } from './screens/HomeScreen'
import { SettingsDialog } from './components/SettingsDialog'

export default function App(): React.JSX.Element {
  const workflow = useImportWorkflow()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const openSettings = useCallback(() => setIsSettingsOpen(true), [])
  const closeSettings = useCallback(() => setIsSettingsOpen(false), [])

  useEffect(() => {
    function preventDefault(e: Event): void {
      e.preventDefault()
    }
    window.addEventListener('dragover', preventDefault)
    window.addEventListener('drop', preventDefault)
    return () => {
      window.removeEventListener('dragover', preventDefault)
      window.removeEventListener('drop', preventDefault)
    }
  }, [])

  return (
    <div className="app-shell">
      <HomeScreen workflow={workflow} onOpenSettings={openSettings} />
      <AnimatePresence>
        {isSettingsOpen && <SettingsDialog workflow={workflow} onClose={closeSettings} />}
      </AnimatePresence>
    </div>
  )
}
