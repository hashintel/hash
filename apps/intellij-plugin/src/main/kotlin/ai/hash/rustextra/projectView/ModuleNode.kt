package ai.hash.rustextra.projectView

import com.intellij.codeInsight.navigation.NavigationUtil
import com.intellij.ide.projectView.NodeSortOrder
import com.intellij.ide.projectView.NodeSortSettings
import com.intellij.ide.projectView.ProjectView
import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.projectView.impl.nodes.PsiFileNode
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import com.intellij.ui.DoubleClickListener
import com.intellij.util.ui.tree.TreeUtil
import java.awt.event.MouseEvent
import java.awt.event.MouseListener
import javax.swing.JTree
import javax.swing.event.TreeExpansionEvent
import javax.swing.event.TreeExpansionListener
import javax.swing.event.TreeSelectionEvent
import javax.swing.event.TreeSelectionListener

class ModuleNode(
    project: Project,
    value: PsiFile,
    viewSettings: ViewSettings?,
    private val children: Collection<AbstractTreeNode<*>>,
) :
    PsiFileNode(project, value, viewSettings) {


    override fun getChildrenImpl(): Collection<AbstractTreeNode<*>> = children

    override fun contains(file: VirtualFile): Boolean = children.any { child ->
        val value = child.value

        if (value is PsiFile) {
            value.virtualFile.equals(file)
        } else {
            false
        }
    }

    override fun expandOnDoubleClick(): Boolean = true

    companion object {
        fun fromPsiFileNode(node: AbstractTreeNode<PsiFile>, settings: ViewSettings?, children: Collection<AbstractTreeNode<*>>) =
            ModuleNode(node.project, node.value, settings, children)
    }
}
