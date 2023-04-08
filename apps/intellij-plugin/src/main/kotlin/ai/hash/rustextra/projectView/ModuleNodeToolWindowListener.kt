package ai.hash.rustextra.projectView

import com.intellij.ide.projectView.ProjectView
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ex.ToolWindowManagerListener

class ModuleNodeToolWindowListener(project: Project) : ToolWindowManagerListener {
    init {
        val currentProjectViewPane = ProjectView.getInstance(project)?.currentProjectViewPane;

        currentProjectViewPane?.tree?.addTreeExpansionListener(ModuleNodeTreeExpansionListener());
    }


//    override fun stateChanged(
//        toolWindowManager: ToolWindowManager,
//        changeType: ToolWindowManagerListener.ToolWindowManagerEventType
//    ) {
//        when (changeType) {
//            ToolWindowManagerListener.ToolWindowManagerEventType.ActivateToolWindow -> TODO()
//            ToolWindowManagerListener.ToolWindowManagerEventType.HideToolWindow -> TODO()
//            ToolWindowManagerListener.ToolWindowManagerEventType.RegisterToolWindow -> TODO()
//            ToolWindowManagerListener.ToolWindowManagerEventType.SetContentUiType -> TODO()
//            ToolWindowManagerListener.ToolWindowManagerEventType.SetLayout -> TODO()
//            ToolWindowManagerListener.ToolWindowManagerEventType.SetShowStripeButton -> TODO()
//            ToolWindowManagerListener.ToolWindowManagerEventType.SetSideTool -> TODO()
//            ToolWindowManagerListener.ToolWindowManagerEventType.SetSideToolAndAnchor -> TODO()
//            ToolWindowManagerListener.ToolWindowManagerEventType.SetToolWindowAnchor -> TODO()
//            ToolWindowManagerListener.ToolWindowManagerEventType.SetToolWindowAutoHide -> TODO()
//            ToolWindowManagerListener.ToolWindowManagerEventType.SetToolWindowType -> TODO()
//            ToolWindowManagerListener.ToolWindowManagerEventType.SetVisibleOnLargeStripe -> TODO()
//            ToolWindowManagerListener.ToolWindowManagerEventType.ShowToolWindow -> TODO()
//            ToolWindowManagerListener.ToolWindowManagerEventType.UnregisterToolWindow -> TODO()
//            ToolWindowManagerListener.ToolWindowManagerEventType.ToolWindowAvailable -> TODO()
//            ToolWindowManagerListener.ToolWindowManagerEventType.ToolWindowUnavailable -> TODO()
//            ToolWindowManagerListener.ToolWindowManagerEventType.MovedOrResized -> TODO()
//        }
//    }
}
