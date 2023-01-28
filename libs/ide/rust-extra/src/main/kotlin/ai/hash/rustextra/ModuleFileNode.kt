package ai.hash.rustextra

import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.projectView.impl.nodes.PsiFileNode
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile
import com.intellij.ui.JBColor
import java.awt.Color

class ModuleFileNode(project: Project, value: PsiFile, viewSettings: ViewSettings) : PsiFileNode(project, value, viewSettings) {

    override fun createPresentation(): PresentationData {
        val previous =  super.createPresentation()
        previous.forcedTextForeground = JBColor.GRAY

        return previous
    }

    override fun getWeight(): Int {
        return 0
    }

    companion object {
        fun fromPsiFileNode(node: PsiFileNode) =
                ModuleFileNode(node.project, node.value, node.settings)
    }
}