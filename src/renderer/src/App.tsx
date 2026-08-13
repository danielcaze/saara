import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useImportWorkflow } from './hooks/useImportWorkflow'
import { HomeScreen } from './screens/HomeScreen'
import { SettingsScreen } from './screens/SettingsScreen'

export default function App(): React.JSX.Element {
  const workflow = useImportWorkflow()
  const [screen, setScreen] = useState<'home' | 'settings'>('home')

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
      <AnimatePresence mode="wait">
        {screen === 'home' ? (
          <motion.div
            key="home"
            className="screen-flex-wrapper"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <HomeScreen workflow={workflow} onOpenSettings={() => setScreen('settings')} />
          </motion.div>
        ) : (
          <motion.div
            key="settings"
            className="screen-flex-wrapper"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <SettingsScreen workflow={workflow} onBack={() => setScreen('home')} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
