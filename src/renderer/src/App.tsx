import { AnimatePresence, motion } from 'motion/react'
import { useImportWorkflow } from './hooks/useImportWorkflow'
import { SetupScreen } from './screens/SetupScreen'
import { ReviewScreen } from './screens/ReviewScreen'

export default function App(): React.JSX.Element {
  const workflow = useImportWorkflow()

  return (
    <div className="app-shell">
      <AnimatePresence mode="wait">
        {workflow.state.stage === 'setup' ? (
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <SetupScreen workflow={workflow} />
          </motion.div>
        ) : (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <ReviewScreen workflow={workflow} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
