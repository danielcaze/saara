import { useImportWorkflow } from './hooks/useImportWorkflow'
import { SetupScreen } from './screens/SetupScreen'

export default function App(): React.JSX.Element {
  const workflow = useImportWorkflow()

  return (
    <div className="app-shell">
      {workflow.state.stage === 'setup' ? (
        <SetupScreen workflow={workflow} />
      ) : (
        <p>Tela de revisão (Task 18)</p>
      )}
    </div>
  )
}
