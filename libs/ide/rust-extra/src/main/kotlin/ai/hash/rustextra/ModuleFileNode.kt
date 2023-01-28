package ai.hash.rustextra

import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.projectView.impl.nodes.PsiFileNode
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile
import com.intellij.ui.JBColor
import java.awt.Color

class ModuleFileNode(project: Project, value: PsiFile, viewSettings: ViewSettings): PsiFileNode(project, value, viewSettings) {
    override fun getHighlightColor(): Color {
        return JBColor.YELLOW
    }

    companion object {
        fun fromPsiFileNode(node: PsiFileNode): ModuleDirectoryNode {
            return ModuleDirectoryNode(node.project, node.value, node.settings)
        }
    }
}