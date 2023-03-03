package ai.hash.rustextra.projectView

import com.intellij.ide.projectView.ProjectView
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ex.ToolWindowManagerListener

class ModuleNodeToolWindowListener(project: Project) : ToolWindowManagerListener {
    init {
        ProjectView.getInstance(project).currentProjectViewPane.tree.addTreeExpansionListener(
            ModuleNodeTreeExpansionListener()
        );
    }
}
